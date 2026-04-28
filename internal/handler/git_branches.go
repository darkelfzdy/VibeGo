package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type BranchInfo struct {
	Name      string `json:"name"`
	IsCurrent bool   `json:"isCurrent"`
}

// Branches godoc
// @Summary List branches
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitPathRequest true "Repository path"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/branches [post]
func (h *GitHandler) Branches(c *gin.Context) {
	var req GitPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	cmd := newGitCommand("branch", "--show-current")
	cmd.Dir = repoRoot
	out, err := cmd.Output()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	currentBranch := strings.TrimSpace(string(out))

	cmd = newGitCommand("branch", "--format=%(refname:short)")
	cmd.Dir = repoRoot
	out, err = cmd.Output()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var branchList []BranchInfo
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line == "" {
			continue
		}
		branchList = append(branchList, BranchInfo{
			Name:      line,
			IsCurrent: line == currentBranch,
		})
	}

	remoteBranches := collectRemoteBranches(repoRoot)

	c.JSON(http.StatusOK, gin.H{
		"branches":       branchList,
		"remoteBranches": remoteBranches,
		"currentBranch":  currentBranch,
	})
}

type SwitchBranchRequest struct {
	Path   string `json:"path" binding:"required"`
	Branch string `json:"branch" binding:"required"`
}

// SwitchBranch godoc
// @Summary Switch to a branch
// @Tags Git
// @Accept json
// @Produce json
// @Param request body SwitchBranchRequest true "Repository path and target branch"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/switch-branch [post]
func (h *GitHandler) SwitchBranch(c *gin.Context) {
	var req SwitchBranchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	verifyCmd := newGitCommand("rev-parse", "--verify", "refs/heads/"+req.Branch)
	verifyCmd.Dir = repoRoot
	if err := verifyCmd.Run(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "branch not found: " + req.Branch})
		return
	}

	cmd := newGitCommand("checkout", req.Branch)
	cmd.Dir = repoRoot
	output, err := cmd.CombinedOutput()
	if err != nil {
		errMsg := strings.TrimSpace(string(output))
		if strings.Contains(errMsg, "unstaged changes") || strings.Contains(errMsg, "would be overwritten") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "cannot switch branch: you have unstaged changes"})
			return
		}
		if errMsg == "" {
			errMsg = err.Error()
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": errMsg})
		return
	}

	h.broadcastStatus(req.Path)
	h.broadcastBranchStatus(req.Path)
	h.broadcastRepoSyncNeeded(req.Path, gin.H{"history": true, "branches": true, "conflicts": true})
	c.JSON(http.StatusOK, gin.H{"ok": true, "branch": req.Branch})
}

// SmartSwitchBranch godoc
// @Summary Switch branch with automatic stash/unstash of uncommitted changes
// @Tags Git
// @Accept json
// @Produce json
// @Param request body SwitchBranchRequest true "Repository path and target branch"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/smart-switch-branch [post]
func (h *GitHandler) SmartSwitchBranch(c *gin.Context) {
	var req SwitchBranchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	statusCmd := newGitCommand("status", "--porcelain")
	statusCmd.Dir = repoRoot
	statusOut, _ := statusCmd.Output()
	hasChanges := len(strings.TrimSpace(string(statusOut))) > 0
	stashed := false
	stashConflict := false

	if hasChanges {
		cmd := newGitCommand("stash", "push", "-m", "auto-stash: switching to "+req.Branch)
		cmd.Dir = repoRoot
		output, err := cmd.CombinedOutput()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "stash failed: " + string(output)})
			return
		}
		stashed = true
	}

	verifyCmd := newGitCommand("rev-parse", "--verify", "refs/heads/"+req.Branch)
	verifyCmd.Dir = repoRoot
	if err := verifyCmd.Run(); err != nil {
		if stashed {
			popCmd := newGitCommand("stash", "pop")
			popCmd.Dir = repoRoot
			popCmd.CombinedOutput()
		}
		c.JSON(http.StatusBadRequest, gin.H{"error": "branch not found: " + req.Branch})
		return
	}

	cmd := newGitCommand("checkout", req.Branch)
	cmd.Dir = repoRoot
	output, err := cmd.CombinedOutput()
	if err != nil {
		if stashed {
			popCmd := newGitCommand("stash", "pop")
			popCmd.Dir = repoRoot
			popCmd.CombinedOutput()
		}
		errMsg := strings.TrimSpace(string(output))
		if errMsg == "" {
			errMsg = err.Error()
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": errMsg})
		return
	}

	if stashed {
		popCmd := newGitCommand("stash", "pop")
		popCmd.Dir = repoRoot
		popOutput, err := popCmd.CombinedOutput()
		if err != nil {
			stashConflict = strings.Contains(string(popOutput), "CONFLICT")
		}
	}

	files := collectFileStatus(repoRoot)
	bs := collectBranchStatus(repoRoot)

	h.broadcastStatus(req.Path)
	h.broadcastBranchStatus(req.Path)
	h.broadcastRepoSyncNeeded(req.Path, gin.H{"history": true, "branches": true, "stashes": true, "conflicts": true})
	c.JSON(http.StatusOK, gin.H{
		"ok": true, "branch": req.Branch,
		"stashed": stashed, "stashConflict": stashConflict,
		"status": gin.H{"files": files}, "branchStatus": bs,
	})
}

// BranchStatus godoc
// @Summary Get current branch upstream status (ahead/behind)
// @Tags Git
// @Accept json
// @Produce json
// @Param request body GitPathRequest true "Repository path"
// @Success 200 {object} BranchStatusInfo
// @Failure 400 {object} map[string]string
// @Router /api/git/branch-status [post]
func (h *GitHandler) BranchStatus(c *gin.Context) {
	var req GitPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	bs := collectBranchStatus(repoRoot)
	c.JSON(http.StatusOK, bs)
}

type CreateBranchRequest struct {
	Path   string `json:"path" binding:"required"`
	Branch string `json:"branch" binding:"required"`
	From   string `json:"from"`
}

// CreateBranch godoc
// @Summary Create a new branch
// @Tags Git
// @Accept json
// @Produce json
// @Param request body CreateBranchRequest true "Repository path, branch name, and optional start point"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/create-branch [post]
func (h *GitHandler) CreateBranch(c *gin.Context) {
	var req CreateBranchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	args := []string{"branch", req.Branch}
	if req.From != "" {
		args = append(args, req.From)
	}

	cmd := newGitCommand(args...)
	cmd.Dir = repoRoot
	output, err := cmd.CombinedOutput()
	if err != nil {
		errMsg := strings.TrimSpace(string(output))
		if errMsg == "" {
			errMsg = err.Error()
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": errMsg})
		return
	}

	h.broadcastRepoSyncNeeded(req.Path, gin.H{"branches": true})
	c.JSON(http.StatusOK, gin.H{"ok": true, "branch": req.Branch})
}

type DeleteBranchRequest struct {
	Path   string `json:"path" binding:"required"`
	Branch string `json:"branch" binding:"required"`
}

// DeleteBranch godoc
// @Summary Delete a branch
// @Tags Git
// @Accept json
// @Produce json
// @Param request body DeleteBranchRequest true "Repository path and branch name"
// @Success 200 {object} map[string]bool
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/git/delete-branch [post]
func (h *GitHandler) DeleteBranch(c *gin.Context) {
	var req DeleteBranchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	repoRoot, err := h.getRepoRoot(req.Path)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	currentCmd := newGitCommand("branch", "--show-current")
	currentCmd.Dir = repoRoot
	out, _ := currentCmd.Output()
	if strings.TrimSpace(string(out)) == req.Branch {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete current branch"})
		return
	}

	cmd := newGitCommand("branch", "-d", req.Branch)
	cmd.Dir = repoRoot
	output, err := cmd.CombinedOutput()
	if err != nil {
		errMsg := strings.TrimSpace(string(output))
		if errMsg == "" {
			errMsg = err.Error()
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": errMsg})
		return
	}

	h.broadcastRepoSyncNeeded(req.Path, gin.H{"branches": true})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

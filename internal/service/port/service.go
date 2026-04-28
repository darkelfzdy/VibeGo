package port

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	psnet "github.com/shirou/gopsutil/v4/net"
	"github.com/shirou/gopsutil/v4/process"
)

type PortInfo struct {
	Port        uint32 `json:"port"`
	Protocol    string `json:"protocol"`
	LocalAddr   string `json:"localAddr"`
	RemoteAddr  string `json:"remoteAddr"`
	Status      string `json:"status"`
	PID         int32  `json:"pid"`
	ProcessName string `json:"processName"`
}

type ForwardRule struct {
	ID         string `json:"id"`
	ListenPort int    `json:"listenPort"`
	Protocol   string `json:"protocol"`
	TargetAddr string `json:"targetAddr"`
	Enabled    bool   `json:"enabled"`
	Error      string `json:"error,omitempty"`
}

type forwardState struct {
	rule     ForwardRule
	listener net.Listener
	udpConn  *net.UDPConn
	httpSrv  *http.Server
	done     chan struct{}
}

type portCache struct {
	mu        sync.RWMutex
	data      []PortInfo
	timestamp time.Time
	ttl       time.Duration
}

type Service struct {
	cache    *portCache
	mu       sync.RWMutex
	forwards map[string]*forwardState
}

func New() *Service {
	return &Service{
		cache: &portCache{
			ttl: 500 * time.Millisecond,
		},
		forwards: make(map[string]*forwardState),
	}
}

func (s *Service) GetListeningPorts() ([]PortInfo, error) {
	s.cache.mu.RLock()
	if time.Since(s.cache.timestamp) < s.cache.ttl && s.cache.data != nil {
		data := s.cache.data
		s.cache.mu.RUnlock()
		return data, nil
	}
	s.cache.mu.RUnlock()

	s.cache.mu.Lock()
	defer s.cache.mu.Unlock()

	if time.Since(s.cache.timestamp) < s.cache.ttl && s.cache.data != nil {
		return s.cache.data, nil
	}

	conns, err := psnet.Connections("all")
	if err != nil {
		return nil, err
	}

	pidNameCache := make(map[int32]string)
	seen := make(map[string]bool)
	var result []PortInfo

	for _, c := range conns {
		if c.Status != "LISTEN" && c.Laddr.Port == 0 {
			continue
		}

		if c.Status == "LISTEN" || (c.Status == "" && c.Raddr.IP == "" && c.Raddr.Port == 0) {
			key := fmt.Sprintf("%s:%d:%d", c.Laddr.IP, c.Laddr.Port, c.Type)
			if seen[key] {
				continue
			}
			seen[key] = true

			proto := "tcp"
			if c.Type == 2 {
				proto = "udp"
			}

			name := ""
			if c.Pid > 0 {
				if cached, ok := pidNameCache[c.Pid]; ok {
					name = cached
				} else {
					if p, err := process.NewProcess(c.Pid); err == nil {
						if n, err := p.Name(); err == nil {
							name = n
						}
					}
					pidNameCache[c.Pid] = name
				}
			}

			result = append(result, PortInfo{
				Port:        c.Laddr.Port,
				Protocol:    proto,
				LocalAddr:   fmt.Sprintf("%s:%d", c.Laddr.IP, c.Laddr.Port),
				RemoteAddr:  "",
				Status:      c.Status,
				PID:         c.Pid,
				ProcessName: name,
			})
		}
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Port < result[j].Port
	})

	s.cache.data = result
	s.cache.timestamp = time.Now()
	return result, nil
}

func (s *Service) KillProcess(pid int32) error {
	if pid <= 0 {
		return fmt.Errorf("invalid pid")
	}
	p, err := process.NewProcess(pid)
	if err != nil {
		return err
	}
	return p.Kill()
}

func normalizeTargetAddr(protocol, addr string) string {
	addr = strings.TrimSpace(addr)
	switch protocol {
	case "http":
		if !strings.HasPrefix(addr, "http://") && !strings.HasPrefix(addr, "https://") {
			addr = "http://" + addr
		}
		return addr
	case "tcp", "udp":
		addr = strings.TrimPrefix(addr, "http://")
		addr = strings.TrimPrefix(addr, "https://")
		addr = strings.TrimSuffix(addr, "/")
		if !strings.Contains(addr, ":") {
			return addr + ":80"
		}
		return addr
	}
	return addr
}

func (s *Service) AddForward(rule ForwardRule) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.forwards[rule.ID]; exists {
		return fmt.Errorf("forward rule %s already exists", rule.ID)
	}

	if rule.ListenPort < 1 || rule.ListenPort > 65535 {
		return fmt.Errorf("invalid listen port: %d", rule.ListenPort)
	}

	rule.TargetAddr = normalizeTargetAddr(rule.Protocol, rule.TargetAddr)

	if rule.Protocol == "tcp" || rule.Protocol == "udp" {
		host, portStr, err := net.SplitHostPort(rule.TargetAddr)
		if err != nil {
			return fmt.Errorf("invalid target address: %s", rule.TargetAddr)
		}
		targetPort, _ := strconv.Atoi(portStr)
		if isLocalHost(host) && targetPort == rule.ListenPort {
			return fmt.Errorf("listen port and target port cannot be the same on localhost")
		}
	} else if rule.Protocol == "http" {
		u, err := url.Parse(rule.TargetAddr)
		if err != nil {
			return fmt.Errorf("invalid target URL: %s", rule.TargetAddr)
		}
		portStr := u.Port()
		if portStr == "" {
			if u.Scheme == "https" {
				portStr = "443"
			} else {
				portStr = "80"
			}
		}
		targetPort, _ := strconv.Atoi(portStr)
		if isLocalHost(u.Hostname()) && targetPort == rule.ListenPort {
			return fmt.Errorf("listen port and target port cannot be the same on localhost")
		}
	}

	state := &forwardState{
		rule: rule,
		done: make(chan struct{}),
	}

	if rule.Enabled {
		if err := s.startForward(state); err != nil {
			return err
		}
	}

	s.forwards[rule.ID] = state
	return nil
}

func isLocalHost(host string) bool {
	host = strings.ToLower(strings.TrimSpace(host))
	if host == "" || host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "0.0.0.0" {
		return true
	}
	return false
}

func (s *Service) RemoveForward(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	state, exists := s.forwards[id]
	if !exists {
		return fmt.Errorf("forward rule %s not found", id)
	}

	s.stopForward(state)
	delete(s.forwards, id)
	return nil
}

func (s *Service) ToggleForward(id string, enabled bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	state, exists := s.forwards[id]
	if !exists {
		return fmt.Errorf("forward rule %s not found", id)
	}

	if enabled && !state.rule.Enabled {
		if err := s.startForward(state); err != nil {
			return err
		}
		state.rule.Enabled = true
		state.rule.Error = ""
	} else if !enabled && state.rule.Enabled {
		s.stopForward(state)
		state.done = make(chan struct{})
		state.rule.Enabled = false
	}

	return nil
}

func (s *Service) ListForwards() []ForwardRule {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]ForwardRule, 0, len(s.forwards))
	for _, state := range s.forwards {
		result = append(result, state.rule)
	}
	return result
}

func (s *Service) startForward(state *forwardState) error {
	switch state.rule.Protocol {
	case "tcp":
		return s.startTCPForward(state)
	case "udp":
		return s.startUDPForward(state)
	case "http":
		return s.startHTTPForward(state)
	default:
		return fmt.Errorf("unsupported protocol: %s", state.rule.Protocol)
	}
}

func (s *Service) stopForward(state *forwardState) {
	select {
	case <-state.done:
	default:
		close(state.done)
	}
	if state.httpSrv != nil {
		state.httpSrv.Close()
		state.httpSrv = nil
	}
	if state.listener != nil {
		state.listener.Close()
		state.listener = nil
	}
	if state.udpConn != nil {
		state.udpConn.Close()
		state.udpConn = nil
	}
}

func (s *Service) startTCPForward(state *forwardState) error {
	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", state.rule.ListenPort))
	if err != nil {
		return fmt.Errorf("failed to listen on port %d: %w", state.rule.ListenPort, err)
	}
	state.listener = listener

	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				select {
				case <-state.done:
					return
				default:
					continue
				}
			}
			go s.handleTCPConn(conn, state.rule.TargetAddr, state.done)
		}
	}()

	return nil
}

func (s *Service) handleTCPConn(src net.Conn, targetAddr string, done chan struct{}) {
	defer src.Close()

	dst, err := net.DialTimeout("tcp", targetAddr, 10*time.Second)
	if err != nil {
		return
	}
	defer dst.Close()

	copyDone := make(chan struct{}, 2)
	go func() {
		io.Copy(dst, src)
		copyDone <- struct{}{}
	}()
	go func() {
		io.Copy(src, dst)
		copyDone <- struct{}{}
	}()

	select {
	case <-copyDone:
	case <-done:
	}
}

func (s *Service) startUDPForward(state *forwardState) error {
	listenAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf(":%d", state.rule.ListenPort))
	if err != nil {
		return err
	}

	conn, err := net.ListenUDP("udp", listenAddr)
	if err != nil {
		return fmt.Errorf("failed to listen on UDP port %d: %w", state.rule.ListenPort, err)
	}
	state.udpConn = conn

	targetAddr, err := net.ResolveUDPAddr("udp", state.rule.TargetAddr)
	if err != nil {
		conn.Close()
		return err
	}

	go func() {
		clients := make(map[string]*net.UDPConn)
		var clientsMu sync.Mutex
		buf := make([]byte, 65535)

		for {
			select {
			case <-state.done:
				clientsMu.Lock()
				for _, c := range clients {
					c.Close()
				}
				clientsMu.Unlock()
				return
			default:
			}

			conn.SetReadDeadline(time.Now().Add(1 * time.Second))
			n, clientAddr, err := conn.ReadFromUDP(buf)
			if err != nil {
				continue
			}

			key := clientAddr.String()
			clientsMu.Lock()
			upstream, exists := clients[key]
			if !exists {
				upstream, err = net.DialUDP("udp", nil, targetAddr)
				if err != nil {
					clientsMu.Unlock()
					continue
				}
				clients[key] = upstream

				go func() {
					rbuf := make([]byte, 65535)
					for {
						select {
						case <-state.done:
							return
						default:
						}
						upstream.SetReadDeadline(time.Now().Add(30 * time.Second))
						rn, err := upstream.Read(rbuf)
						if err != nil {
							clientsMu.Lock()
							delete(clients, key)
							clientsMu.Unlock()
							upstream.Close()
							return
						}
						conn.WriteToUDP(rbuf[:rn], clientAddr)
					}
				}()
			}
			clientsMu.Unlock()

			upstream.Write(buf[:n])
		}
	}()

	return nil
}

func (s *Service) startHTTPForward(state *forwardState) error {
	targetURL, err := url.Parse(state.rule.TargetAddr)
	if err != nil {
		return fmt.Errorf("invalid target URL: %w", err)
	}

	if targetURL.Scheme == "" {
		targetURL.Scheme = "http"
	}
	if targetURL.Host == "" {
		return fmt.Errorf("target URL must have a host")
	}

	transport := &http.Transport{
		Proxy: nil,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		MaxIdleConnsPerHost:   20,
		IdleConnTimeout:       90 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
	}

	proxy := httputil.NewSingleHostReverseProxy(targetURL)
	proxy.Transport = transport
	proxy.Director = func(req *http.Request) {
		req.URL.Scheme = targetURL.Scheme
		req.URL.Host = targetURL.Host
		if targetURL.Path != "" && targetURL.Path != "/" {
			req.URL.Path = singleJoiningSlash(targetURL.Path, req.URL.Path)
		}
		req.Header.Set("X-Forwarded-Host", req.Host)
		req.Header.Set("X-Forwarded-Proto", "http")
		req.Host = targetURL.Host
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		http.Error(w, fmt.Sprintf("proxy error: %v", err), http.StatusBadGateway)
	}
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Del("X-Frame-Options")
		return nil
	}

	listener, err := net.Listen("tcp", fmt.Sprintf(":%d", state.rule.ListenPort))
	if err != nil {
		return fmt.Errorf("failed to listen on port %d: %w", state.rule.ListenPort, err)
	}
	state.listener = listener

	srv := &http.Server{
		Handler:      proxy,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
	state.httpSrv = srv

	go func() {
		if err := srv.Serve(listener); err != nil && err != http.ErrServerClosed {
			state.rule.Error = err.Error()
		}
	}()
	go func() {
		<-state.done
		srv.Close()
	}()

	return nil
}

func singleJoiningSlash(a, b string) string {
	aSlash := strings.HasSuffix(a, "/")
	bSlash := strings.HasPrefix(b, "/")
	switch {
	case aSlash && bSlash:
		return a + b[1:]
	case !aSlash && !bSlash:
		return a + "/" + b
	}
	return a + b
}

func (s *Service) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, state := range s.forwards {
		s.stopForward(state)
	}
}

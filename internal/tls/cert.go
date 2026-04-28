package tls

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"errors"
	"encoding/pem"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"slices"
	"time"
)

func EnsureCert(configDir string) (certFile, keyFile string, err error) {
	certFile = filepath.Join(configDir, "cert.pem")
	keyFile = filepath.Join(configDir, "key.pem")

	if fileExists(certFile) && fileExists(keyFile) {
		valid, certErr := isCertUsable(certFile)
		if certErr == nil && valid {
			return
		}
	}

	err = generateCert(certFile, keyFile)
	return
}

func generateCert(certFile, keyFile string) error {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return err
	}

	serialNumber, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return err
	}

	ips := collectLocalIPs()
	ips = append(ips, net.ParseIP("127.0.0.1"), net.ParseIP("::1"))

	template := x509.Certificate{
		SerialNumber: serialNumber,
		Subject: pkix.Name{
			Organization: []string{"VibeGo Self-Signed"},
			CommonName:   "localhost",
		},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(10 * 365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              []string{"localhost"},
		IPAddresses:           ips,
	}

	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		return err
	}

	os.MkdirAll(filepath.Dir(certFile), 0700)

	certOut, err := os.Create(certFile)
	if err != nil {
		return err
	}
	defer certOut.Close()
	pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: certDER})

	keyBytes, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		return err
	}
	keyOut, err := os.OpenFile(keyFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	defer keyOut.Close()
	pem.Encode(keyOut, &pem.Block{Type: "EC PRIVATE KEY", Bytes: keyBytes})

	return nil
}

func collectLocalIPs() []net.IP {
	seen := make(map[string]struct{})
	var ips []net.IP
	ifaces, err := net.Interfaces()
	if err != nil {
		return ips
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip == nil {
				continue
			}
			ip = normalizeIP(ip)
			if ip == nil {
				continue
			}
			key := ip.String()
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			ips = append(ips, ip)
		}
	}
	slices.SortFunc(ips, func(a, b net.IP) int {
		return slices.Compare([]byte(a), []byte(b))
	})
	return ips
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func isCertUsable(certFile string) (bool, error) {
	data, err := os.ReadFile(certFile)
	if err != nil {
		return false, err
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return false, errors.New("invalid pem")
	}
	cert, err := x509.ParseCertificate(block.Bytes)
	if err != nil {
		return false, err
	}
	if time.Now().After(cert.NotAfter) {
		return false, nil
	}
	return certCoversLocalIPs(cert), nil
}

func certCoversLocalIPs(cert *x509.Certificate) bool {
	expected := collectLocalIPs()
	for _, ip := range []net.IP{net.ParseIP("127.0.0.1"), net.ParseIP("::1")} {
		ip = normalizeIP(ip)
		if ip != nil {
			expected = append(expected, ip)
		}
	}

	if len(expected) == 0 {
		return true
	}

	certIPs := make(map[string]struct{}, len(cert.IPAddresses))
	for _, ip := range cert.IPAddresses {
		ip = normalizeIP(ip)
		if ip == nil {
			continue
		}
		certIPs[ip.String()] = struct{}{}
	}

	for _, ip := range expected {
		if _, ok := certIPs[ip.String()]; !ok {
			return false
		}
	}
	return true
}

func normalizeIP(ip net.IP) net.IP {
	if ip == nil {
		return nil
	}
	if v4 := ip.To4(); v4 != nil {
		return v4
	}
	return ip.To16()
}

package tls

import (
	"crypto/x509"
	"encoding/pem"
	"os"
	"path/filepath"
	"testing"
)

func TestEnsureCertRegeneratesWhenCurrentIPMissing(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	certFile := filepath.Join(dir, "cert.pem")
	keyFile := filepath.Join(dir, "key.pem")

	if err := generateCert(certFile, keyFile); err != nil {
		t.Fatalf("generateCert: %v", err)
	}

	certBefore, err := readCert(certFile)
	if err != nil {
		t.Fatalf("readCert before: %v", err)
	}
	if len(certBefore.IPAddresses) == 0 {
		t.Fatal("expected generated cert to contain ip addresses")
	}

	truncated := *certBefore
	truncated.IPAddresses = truncated.IPAddresses[:1]
	if err := writeCert(certFile, &truncated); err != nil {
		t.Fatalf("write truncated cert: %v", err)
	}

	if _, _, err := EnsureCert(dir); err != nil {
		t.Fatalf("EnsureCert: %v", err)
	}

	certAfter, err := readCert(certFile)
	if err != nil {
		t.Fatalf("readCert after: %v", err)
	}
	if len(certAfter.IPAddresses) <= len(truncated.IPAddresses) {
		t.Fatalf("expected cert to be regenerated with more ip addresses, got %d", len(certAfter.IPAddresses))
	}
	if !certCoversLocalIPs(certAfter) {
		t.Fatal("expected regenerated cert to cover local ip addresses")
	}
}

func readCert(certFile string) (*x509.Certificate, error) {
	data, err := os.ReadFile(certFile)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(data)
	return x509.ParseCertificate(block.Bytes)
}

func writeCert(certFile string, cert *x509.Certificate) error {
	return os.WriteFile(certFile, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: cert.Raw}), 0600)
}

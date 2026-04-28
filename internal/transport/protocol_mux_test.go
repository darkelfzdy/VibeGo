package transport

import (
	"io"
	"net"
	"testing"
	"time"
)

func TestProtocolMuxRoutesHTTPAndTLS(t *testing.T) {
	t.Parallel()

	base, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	mux := NewProtocolMux(base)
	defer mux.Close()

	httpResult := make(chan string, 1)
	tlsResult := make(chan byte, 1)
	errCh := make(chan error, 2)

	go func() {
		conn, err := mux.HTTP().Accept()
		if err != nil {
			errCh <- err
			return
		}
		defer conn.Close()

		buf := make([]byte, 4)
		if _, err := io.ReadFull(conn, buf); err != nil {
			errCh <- err
			return
		}
		httpResult <- string(buf)
	}()

	go func() {
		conn, err := mux.TLS().Accept()
		if err != nil {
			errCh <- err
			return
		}
		defer conn.Close()

		buf := make([]byte, 1)
		if _, err := io.ReadFull(conn, buf); err != nil {
			errCh <- err
			return
		}
		tlsResult <- buf[0]
	}()

	httpConn, err := net.Dial("tcp", base.Addr().String())
	if err != nil {
		t.Fatalf("dial http: %v", err)
	}
	if _, err := httpConn.Write([]byte("GET / HTTP/1.1\r\nHost: example\r\n\r\n")); err != nil {
		t.Fatalf("write http: %v", err)
	}
	_ = httpConn.Close()

	tlsConn, err := net.Dial("tcp", base.Addr().String())
	if err != nil {
		t.Fatalf("dial tls: %v", err)
	}
	if _, err := tlsConn.Write([]byte{0x16, 0x03, 0x01, 0x00, 0x00}); err != nil {
		t.Fatalf("write tls: %v", err)
	}
	_ = tlsConn.Close()

	timeout := time.After(2 * time.Second)
	receivedHTTP := false
	receivedTLS := false

	for !receivedHTTP || !receivedTLS {
		select {
		case value := <-httpResult:
			if value != "GET " {
				t.Fatalf("http prefix = %q, want %q", value, "GET ")
			}
			receivedHTTP = true
		case value := <-tlsResult:
			if value != 0x16 {
				t.Fatalf("tls prefix = %x, want %x", value, byte(0x16))
			}
			receivedTLS = true
		case err := <-errCh:
			t.Fatalf("accept/read error: %v", err)
		case <-timeout:
			t.Fatal("timed out waiting for mux results")
		}
	}
}

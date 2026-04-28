package transport

import (
	"bytes"
	"io"
	"net"
	"sync"
	"time"
)

type ProtocolMux struct {
	base      net.Listener
	httpLn    *protocolListener
	tlsLn     *protocolListener
	closeOnce sync.Once
}

type protocolListener struct {
	addr      net.Addr
	connCh    chan net.Conn
	closed    chan struct{}
	closeOnce sync.Once
}

type prefixedConn struct {
	net.Conn
	reader io.Reader
}

func NewProtocolMux(base net.Listener) *ProtocolMux {
	mux := &ProtocolMux{
		base:   base,
		httpLn: newProtocolListener(base.Addr()),
		tlsLn:  newProtocolListener(base.Addr()),
	}
	go mux.acceptLoop()
	return mux
}

func (m *ProtocolMux) HTTP() net.Listener {
	return m.httpLn
}

func (m *ProtocolMux) TLS() net.Listener {
	return m.tlsLn
}

func (m *ProtocolMux) Close() error {
	var err error
	m.closeOnce.Do(func() {
		m.httpLn.close()
		m.tlsLn.close()
		err = m.base.Close()
	})
	return err
}

func newProtocolListener(addr net.Addr) *protocolListener {
	return &protocolListener{
		addr:   addr,
		connCh: make(chan net.Conn, 64),
		closed: make(chan struct{}),
	}
}

func (l *protocolListener) Accept() (net.Conn, error) {
	select {
	case conn := <-l.connCh:
		if conn == nil {
			return nil, net.ErrClosed
		}
		return conn, nil
	case <-l.closed:
		return nil, net.ErrClosed
	}
}

func (l *protocolListener) Close() error {
	l.close()
	return nil
}

func (l *protocolListener) Addr() net.Addr {
	return l.addr
}

func (l *protocolListener) close() {
	l.closeOnce.Do(func() {
		close(l.closed)
	})
}

func (l *protocolListener) deliver(conn net.Conn) bool {
	select {
	case <-l.closed:
		return false
	default:
	}

	select {
	case l.connCh <- conn:
		return true
	case <-l.closed:
		return false
	}
}

func (m *ProtocolMux) acceptLoop() {
	for {
		conn, err := m.base.Accept()
		if err != nil {
			_ = m.Close()
			return
		}
		go m.dispatch(conn)
	}
}

func (m *ProtocolMux) dispatch(conn net.Conn) {
	if err := conn.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		_ = conn.Close()
		return
	}

	var prefix [1]byte
	if _, err := io.ReadFull(conn, prefix[:]); err != nil {
		_ = conn.Close()
		return
	}

	_ = conn.SetReadDeadline(time.Time{})

	target := m.httpLn
	if prefix[0] == 0x16 {
		target = m.tlsLn
	}

	wrapped := &prefixedConn{
		Conn:   conn,
		reader: io.MultiReader(bytes.NewReader(prefix[:]), conn),
	}

	if !target.deliver(wrapped) {
		_ = conn.Close()
	}
}

func (c *prefixedConn) Read(p []byte) (int, error) {
	return c.reader.Read(p)
}

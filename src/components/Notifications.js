import { useEffect, useState } from 'react'
import { Toast, ToastContainer } from 'react-bootstrap'
import { CheckCircle, InfoCircle, XCircle } from 'react-bootstrap-icons'

// tiny helper: forces a toast to re-open even if it was already open
const restart = (setter, before) => {
  if (before) before()
  setter(false)
  setTimeout(() => setter(true), 0)
}

const Notifications = () => {
  const [approved, setApproved]   = useState(false)
  const [sent, setSent]           = useState(false)
  const [relaying, setRelaying]   = useState(false)
  const [received, setReceived]   = useState(false)
  const [reverted, setReverted]   = useState(false)

  const [sentLink, setSentLink]           = useState(null)
  const [relayingLink, setRelayingLink]   = useState(null)
  const [receivedLink, setReceivedLink]   = useState(null)

  useEffect(() => {
    const onApproved = () => restart(setApproved)
    const onSent = (e) => restart(setSent, () => setSentLink(e.detail?.link || null))
    const onRelaying = (e) => restart(setRelaying, () => setRelayingLink(e.detail?.link || null))
    const onReceived = (e) => restart(setReceived, () => setReceivedLink(e.detail?.link || null))
    const onReverted = () => restart(setReverted)

    window.addEventListener('bridge:approved', onApproved)
    window.addEventListener('toast:sent', onSent)
    window.addEventListener('toast:relaying', onRelaying)
    window.addEventListener('toast:received', onReceived)
    window.addEventListener('toast:reverted', onReverted)
    return () => {
        window.removeEventListener('bridge:approved', onApproved)
        window.removeEventListener('toast:sent', onSent)
        window.removeEventListener('toast:relaying', onRelaying)
        window.removeEventListener('toast:received', onReceived)
        window.removeEventListener('toast:reverted', onReverted)
      }
    }, [])

    return (
      <ToastContainer
      className="position-fixed p-3"
      style={{ top: 72, right: '100px', zIndex: 3000 }}
    >
      {/* Approved */}
      <Toast
        show={approved}
        onClose={() => setApproved(false)}
        delay={150000}
        autohide
        closeButton={false}
        className="bg-body text-body border position-relative"
      >
        <button
          type="button"
          className="btn-close position-absolute top-0 end-0 mt-1 me-1"
          aria-label="Close"
          onClick={(e) => { e.stopPropagation(); setApproved(false); }}
        />
        <Toast.Body className="d-flex align-items-center gap-2">
          <CheckCircle className="text-success" size={30} />
          <strong>Approved</strong>
        </Toast.Body>
      </Toast>

      {/* Sent */}
      <Toast
        show={sent}
        onClose={() => setSent(false)}
        delay={150000}
        autohide
        closeButton={false}
        className="bg-body text-body border position-relative"
      >
        <button
          type="button"
          className="btn-close position-absolute top-0 end-0 mt-1 me-1"
          aria-label="Close"
          onClick={(e) => { e.stopPropagation(); setSent(false); }}
        />
        <Toast.Body className="d-flex align-items-center gap-2">
          <CheckCircle className="text-success" size={30} />
          <strong>Sent</strong>
          <a href={sentLink || '#'} target="_blank" rel="noreferrer" className="text-decoration-none">
            Open in explorer ↗
          </a>
        </Toast.Body>
      </Toast>

      {/* Relaying */}
      <Toast
        show={relaying}
        onClose={() => setRelaying(false)}
        delay={150000}
        autohide
        closeButton={false}
        className="bg-body text-body border position-relative"
      >
        <button
          type="button"
          className="btn-close position-absolute top-0 end-0 mt-1 me-1"
          aria-label="Close"
          onClick={(e) => { e.stopPropagation(); setRelaying(false); }}
        />
        <Toast.Body>
          <div className="d-flex align-items-center gap-2 mb-1">
            <InfoCircle className="text-warning" size={30} />
            <strong>Your transaction is being indexed on Axelarscan. View details there shortly.</strong>
          </div>
          <div className="small text-muted">Transaction is expected to be completed in 15–20 minutes.</div>
          <div className="mt-2">
            <a href={relayingLink || '#'} target="_blank" rel="noreferrer" className="text-decoration-none">
              Open Axelar GMP ↗
            </a>
          </div>
        </Toast.Body>
      </Toast>

      {/* Received */}
      <Toast
        show={received}
        onClose={() => setReceived(false)}
        delay={150000}
        autohide
        closeButton={false}
        className="bg-body text-body border position-relative"
      >
        <button
          type="button"
          className="btn-close position-absolute top-0 end-0 mt-1 me-1"
          aria-label="Close"
          onClick={(e) => { e.stopPropagation(); setReceived(false); }}
        />
        <Toast.Body className="d-flex align-items-center gap-2">
          <CheckCircle className="text-success" size={30} />
          <strong>Received</strong>
          <a href={receivedLink || '#'} target="_blank" rel="noreferrer" className="text-decoration-none">
            Open in explorer ↗
          </a>
        </Toast.Body>
      </Toast>

      {/* Reverted */}
      <Toast
        show={reverted}
        onClose={() => setReverted(false)}
        delay={150000}
        autohide
        closeButton={false}
        className="bg-body text-body border position-relative"
      >
        <button
          type="button"
          className="btn-close position-absolute top-0 end-0 mt-1 me-1"
          aria-label="Close"
          onClick={(e) => { e.stopPropagation(); setReverted(false); }}
        />
        <Toast.Body className="d-flex align-items-center gap-2">
          <XCircle className="text-danger" size={30} />
          <strong>Bridge transaction reverted.</strong>
        </Toast.Body>
      </Toast>
    </ToastContainer>
  )
}

export default Notifications;

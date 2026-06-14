// Core
import { useEffect, useRef, useState } from 'react'

interface Props {
  title: string
  initialValue?: string
  confirmLabel: string
  onSubmit: (name: string) => void
  onClose: () => void
}

export default function PlaylistFormModal({
  title,
  initialValue = '',
  confirmLabel,
  onSubmit,
  onClose,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = () => {
    if (!value.trim()) {
      setError('Please enter a playlist name')
      return
    }
    onSubmit(value.trim())
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <input
          ref={inputRef}
          type="text"
          placeholder="Playlist name"
          value={value}
          maxLength={80}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        {error && <div className="error">{error}</div>}
        <div className="actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

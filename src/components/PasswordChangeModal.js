import { useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import toast from 'react-hot-toast'
import styles from '../styles/PasswordChangeModal.module.css'

const PasswordChangeModal = ({ isOpen, onClose }) => {
  const [passwords, setPasswords] = useState({
    newPassword: '',
    confirmPassword: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const { user, changePassword } = useAuth()

  if (!isOpen) return null

  const handleChange = (e) => {
    const { name, value } = e.target
    setPasswords(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!passwords.newPassword) {
      toast.error('Please enter a new password')
      return
    }

    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }



    setIsLoading(true)

    try {
      const result = await changePassword(passwords.newPassword)
      
      if (result.success) {
        // Reset form and close modal
        setPasswords({
          newPassword: '',
          confirmPassword: ''
        })
        onClose()
        toast.success('Password updated successfully!')
      } else {
        toast.error(result.error || 'Failed to update password')
      }
    } catch (error) {
      console.error('Password update error:', error)
      toast.error('An error occurred while updating password')
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setPasswords({
      newPassword: '',
      confirmPassword: ''
    })
    onClose()
  }

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Settings - Change Password</h2>
          <button onClick={handleClose} className={styles.modalCloseButton}>
            <X size={24} />
          </button>
        </div>
        
        <div className={styles.modalBody}>
          <div className={styles.userInfo}>
            <p><strong>Employee ID:</strong> {user?.id}</p>
            <p><strong>Name:</strong> {user?.name}</p>
            <p><strong>Rank:</strong> {user?.rank}</p>
            <p><strong>Base:</strong> {user?.base}</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.passwordForm}>
            <div className={styles.formGroup}>
              <label htmlFor="newPassword">New Password:</label>
              <input
                type="password"
                id="newPassword"
                name="newPassword"
                value={passwords.newPassword}
                onChange={handleChange}
                placeholder="Enter new password"
                disabled={isLoading}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="confirmPassword">Confirm New Password:</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={passwords.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm new password"
                disabled={isLoading}
                required
              />
            </div>

            <div className={styles.formActions}>
              <button 
                type="button" 
                onClick={handleClose}
                className={styles.cancelButton}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className={styles.submitButton}
                disabled={isLoading}
              >
                {isLoading ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>

          <div className={styles.passwordNote}>
            <p><em>Note: You can use any password you prefer - no specific requirements.</em></p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PasswordChangeModal
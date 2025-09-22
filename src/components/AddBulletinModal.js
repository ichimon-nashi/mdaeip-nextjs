'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import moment from 'moment';
import styles from '../styles/AddBulletinModal.module.css';

const AddBulletinModal = ({ isOpen, onClose, onAdd }) => {
  const [formData, setFormData] = useState({
    date: moment().format('YYYY-MM-DD'),
    time: moment().format('HH:mm'),
    bulletin_id: '',
    title: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.bulletin_id || !formData.title) {
      alert('Please fill in all required fields');
      return;
    }

    setIsLoading(true);

    try {
      const success = await onAdd(formData);
      if (success) {
        // Reset form and close modal
        setFormData({
          date: moment().format('YYYY-MM-DD'),
          time: moment().format('HH:mm'),
          bulletin_id: '',
          title: ''
        });
        onClose();
      }
    } catch (error) {
      console.error('Add bulletin error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      date: moment().format('YYYY-MM-DD'),
      time: moment().format('HH:mm'),
      bulletin_id: '',
      title: ''
    });
    onClose();
  };

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Add New Bulletin</h2>
          <button onClick={handleClose} className={styles.modalCloseButton}>
            <X size={24} />
          </button>
        </div>
        
        <div className={styles.modalBody}>
          <form onSubmit={handleSubmit} className={styles.bulletinForm}>
            <div className={styles.formGroup}>
              <label htmlFor="date">Date:</label>
              <input
                type="date"
                id="date"
                name="date"
                value={formData.date}
                onChange={handleChange}
                disabled={isLoading}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="time">Time:</label>
              <input
                type="time"
                id="time"
                name="time"
                value={formData.time}
                onChange={handleChange}
                disabled={isLoading}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="bulletin_id">Bulletin ID:</label>
              <input
                type="text"
                id="bulletin_id"
                name="bulletin_id"
                value={formData.bulletin_id}
                onChange={handleChange}
                placeholder="e.g., G2509-006"
                disabled={isLoading}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="title">Title:</label>
              <textarea
                id="title"
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="Enter bulletin title..."
                rows="3"
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
                {isLoading ? 'Adding...' : 'Add Bulletin'}
              </button>
            </div>
          </form>

          <div className={styles.formNote}>
            <p><em>Note: The system automatically keeps only the 20 most recent bulletins.</em></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddBulletinModal;
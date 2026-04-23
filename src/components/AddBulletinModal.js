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
  const [bulletinRaw, setBulletinRaw] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBulletinInput = (e) => {
    const value = e.target.value;
    setBulletinRaw(value);
    const match = value.match(/([A-Z]\d{4}-\d{3})\s*:\s*(.+)/);
    if (match) {
      setFormData(prev => ({
        ...prev,
        bulletin_id: match[1].trim(),
        title: match[2].trim()
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        bulletin_id: value,
        title: ''
      }));
    }
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
        setFormData({
          date: moment().format('YYYY-MM-DD'),
          time: moment().format('HH:mm'),
          bulletin_id: '',
          title: ''
        });
        setBulletinRaw('');
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
    setBulletinRaw('');
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
              <label htmlFor="bulletinRaw">公告:</label>
              <textarea
                id="bulletinRaw"
                value={bulletinRaw}
                onChange={handleBulletinInput}
                placeholder="貼上公告，例如：空服公告G2604-007 : 越南胡志明實施「外國人入境卡」網上填報。"
                rows="3"
                disabled={isLoading}
                required
              />
              {formData.bulletin_id && formData.title && (
                <div className={styles.parsedPreview}>
                  <span><strong>ID:</strong> {formData.bulletin_id}</span>
                  <span><strong>標題:</strong> {formData.title}</span>
                </div>
              )}
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
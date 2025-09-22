'use client';

import { useState } from "react";
import { X } from "lucide-react";
import moment from "moment";
import styles from "../styles/AddRemarkModal.module.css";

const AddRemarkModal = ({ isOpen, onClose, onAdd }) => {
	const [formData, setFormData] = useState({
		date: moment().format("YYYY-MM-DD"),
		message: "",
	});
	const [isLoading, setIsLoading] = useState(false);

	if (!isOpen) return null;

	const handleChange = (e) => {
		const { name, value } = e.target;
		setFormData((prev) => ({
			...prev,
			[name]: value,
		}));
	};

	const handleSubmit = async (e) => {
		e.preventDefault();

		if (!formData.message.trim()) {
			alert("Please enter a remark message");
			return;
		}

		setIsLoading(true);

		try {
			const success = await onAdd(formData);
			if (success) {
				// Reset form
				setFormData({
					date: moment().format("YYYY-MM-DD"),
					message: "",
				});
				onClose();
			}
		} catch (error) {
			console.error("Error adding remark:", error);
			alert("Failed to add remark. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	const handleClose = () => {
		if (!isLoading) {
			setFormData({
				date: moment().format("YYYY-MM-DD"),
				message: "",
			});
			onClose();
		}
	};

	return (
		<div className={styles.modalOverlay}>
			<div className={styles.modalContainer}>
				<div className={styles.modalHeader}>
					<h2 className={styles.modalTitle}>Add Additional Remark</h2>
					<button
						onClick={handleClose}
						className={styles.closeButton}
						disabled={isLoading}
					>
						<X size={20} />
					</button>
				</div>

				<div className={styles.modalBody}>
					<form onSubmit={handleSubmit} className={styles.remarkForm}>
						<div className={styles.formGroup}>
							<label htmlFor="date">Date</label>
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
							<label htmlFor="message">Remark Message</label>
							<textarea
								id="message"
								name="message"
								value={formData.message}
								onChange={handleChange}
								placeholder="Enter additional remark..."
								disabled={isLoading}
								rows={4}
								required
							/>
						</div>

						<div className={styles.formNote}>
							<p>
								<strong>Note:</strong> This remark will be added
								to the additional remarks section and will
								appear in future ETR generations for the
								selected date.
							</p>
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
								{isLoading ? "Adding..." : "Add Remark"}
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
};

export default AddRemarkModal;
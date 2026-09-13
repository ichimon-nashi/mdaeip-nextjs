"use client";

// SignaturePadModal
// ─────────────────────────────────────────────────────────────────────────────
// Plain <canvas> + pointer events — no extra npm dependency for this. The
// canvas itself is transparent (not filled white) so the exported PNG has
// no opaque box baked in when it's embedded into the PDF — a filled white
// background would print as a visible white rectangle on the form. The
// canvas LOOKS white on screen only because of a CSS background on
// .sigCanvas; that's a display-only style, it isn't part of the actual
// pixel data that toDataURL() exports.
//
// Two ways to get a signature onto the canvas: draw with mouse/touch, or
// upload an existing image. Both end up as pixels ON THE SAME CANVAS, so
// clear/confirm/toDataURL all work identically regardless of source — the
// upload path doesn't bypass the canvas, it draws INTO it. Per Eric: this
// is one-time use only, nothing here persists the image anywhere (no
// storage call, no DB write) — it exists only in this component's state
// until "確認簽名" hands the data URL back to the caller.
// ─────────────────────────────────────────────────────────────────────────────

import { useRef, useState, useEffect } from "react";
import styles from "../../styles/EvalFormGenerator.module.css";

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 180;

export default function SignaturePadModal({ onConfirm, onCancel }) {
	const canvasRef = useRef(null);
	const fileInputRef = useRef(null);
	const isDrawingRef = useRef(false);
	const lastPointRef = useRef(null);
	const [isEmpty, setIsEmpty] = useState(true);

	const clearCanvas = () => {
		const ctx = canvasRef.current.getContext("2d");
		ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
	};

	useEffect(() => {
		const ctx = canvasRef.current.getContext("2d");
		clearCanvas();
		ctx.strokeStyle = "#111111";
		ctx.lineWidth = 2.5;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
	}, []);

	const getPos = (e) => {
		const rect = canvasRef.current.getBoundingClientRect();
		const point = e.touches ? e.touches[0] : e;
		return {
			x: (point.clientX - rect.left) * (CANVAS_WIDTH / rect.width),
			y: (point.clientY - rect.top) * (CANVAS_HEIGHT / rect.height),
		};
	};

	const handleStart = (e) => {
		e.preventDefault();
		isDrawingRef.current = true;
		lastPointRef.current = getPos(e);
	};

	const handleMove = (e) => {
		if (!isDrawingRef.current) return;
		e.preventDefault();
		const ctx = canvasRef.current.getContext("2d");
		const pos = getPos(e);
		ctx.beginPath();
		ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
		ctx.lineTo(pos.x, pos.y);
		ctx.stroke();
		lastPointRef.current = pos;
		setIsEmpty(false);
	};

	const handleEnd = () => {
		isDrawingRef.current = false;
	};

	const handleClear = () => {
		clearCanvas();
		setIsEmpty(true);
	};

	// Draws the uploaded image onto the canvas, scaled to fit (contain,
	// not stretch) and centered — so a tall narrow photo of a signature
	// doesn't get warped to fill the 480x180 box. Note: this doesn't make
	// an uploaded photo's own background transparent — if the source
	// image is a JPEG or a screenshot with an opaque white/colored
	// background, that background comes along with it. Transparency here
	// only means the CANVAS isn't pre-filled; it can't strip a background
	// baked into whatever file gets uploaded.
	const handleFileSelect = (e) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const img = new Image();
			img.onload = () => {
				const ctx = canvasRef.current.getContext("2d");
				clearCanvas();
				const scale = Math.min(CANVAS_WIDTH / img.width, CANVAS_HEIGHT / img.height);
				const drawWidth = img.width * scale;
				const drawHeight = img.height * scale;
				const offsetX = (CANVAS_WIDTH - drawWidth) / 2;
				const offsetY = (CANVAS_HEIGHT - drawHeight) / 2;
				ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
				setIsEmpty(false);
			};
			img.src = reader.result;
		};
		reader.readAsDataURL(file);
		e.target.value = ""; // allow re-selecting the same file later
	};

	const handleConfirm = () => {
		if (isEmpty) return;
		onConfirm(canvasRef.current.toDataURL("image/png"));
	};

	return (
		<div className={styles.sigModalBackdrop} onClick={onCancel}>
			<div className={styles.sigModal} onClick={(e) => e.stopPropagation()}>
				<div className={styles.sigModalTitle}>教師簽名</div>
				<canvas
					ref={canvasRef}
					width={CANVAS_WIDTH}
					height={CANVAS_HEIGHT}
					className={styles.sigCanvas}
					onMouseDown={handleStart}
					onMouseMove={handleMove}
					onMouseUp={handleEnd}
					onMouseLeave={handleEnd}
					onTouchStart={handleStart}
					onTouchMove={handleMove}
					onTouchEnd={handleEnd}
				/>
				<div className={styles.sigModalHint}>手寫簽名，或上傳現有的簽名圖片</div>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					onChange={handleFileSelect}
					className={styles.sigFileInputHidden}
				/>
				<div className={styles.sigModalActions}>
					<button type="button" className={styles.sigClearBtn} onClick={() => fileInputRef.current?.click()}>
						上傳圖片
					</button>
					<button type="button" className={styles.sigClearBtn} onClick={handleClear}>清除</button>
					<button type="button" className={styles.sigCancelBtn} onClick={onCancel}>取消</button>
					<button type="button" className={styles.sigConfirmBtn} onClick={handleConfirm} disabled={isEmpty}>
						確認簽名
					</button>
				</div>
			</div>
		</div>
	);
}
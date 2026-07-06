'use client'

import { useState } from "react";
import Navbar from "./Navbar";
import NavigationDrawer from "./NavigationDrawer";
import { useAuth } from "../contexts/AuthContext";
import styles from "../styles/GlobalLoading.module.css";

const Layout = ({ children }) => {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const { user, loading } = useAuth();

    const handleMenuClick = () => {
        setIsDrawerOpen(true);
    };

    const handleDrawerClose = () => {
        setIsDrawerOpen(false);
    };

    // Global loading screen — shown once, here, during the initial auth
    // check. Previously every page (ground-schedule, ground-roster, etc.)
    // built its own near-identical loading screen since Layout never
    // rendered one itself. This replaces all of those with a single
    // shared screen. Mascot image is a placeholder until a final image is
    // approved — swap the src in GlobalLoading.module.css's background or
    // below once ready.
    if (loading) {
        return (
            <div className={styles.globalLoadingScreen}>
                <div className={styles.globalLoadingContent}>
                    <img
                        src="/K-dogmatic.png"
                        alt=""
                        className={styles.globalLoadingMascot}
                    />
                    <div className={styles.globalLoadingSpinner} />
                    <p className={styles.globalLoadingText}>載入中...</p>
                </div>
            </div>
        );
    }

    // Don't show layout for login page or when no user
    if (!user) {
        return children;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            <Navbar onMenuClick={handleMenuClick} />
            <NavigationDrawer 
                isOpen={isDrawerOpen} 
                onClose={handleDrawerClose}
                userDetails={user}
            />
            <main style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {children}
            </main>
        </div>
    );
};

export default Layout;
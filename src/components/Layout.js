'use client'

import { useState } from "react";
import Navbar from "./Navbar";
import NavigationDrawer from "./NavigationDrawer";
import { useAuth } from "../contexts/AuthContext";

const Layout = ({ children }) => {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const { user } = useAuth();

    const handleMenuClick = () => {
        setIsDrawerOpen(true);
    };

    const handleDrawerClose = () => {
        setIsDrawerOpen(false);
    };

    // Don't show layout for login page or when no user
    if (!user) {
        return children;
    }

    return (
        <div>
            <Navbar onMenuClick={handleMenuClick} />
            <NavigationDrawer 
                isOpen={isDrawerOpen} 
                onClose={handleDrawerClose}
                userDetails={user}
            />
            <main>
                {children}
            </main>
        </div>
    );
};

export default Layout;
'use client'

import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { X, Calendar, Clock, Users, Settings, MapPin, FileText, Utensils, NotebookPen, Crown, Shield, User, Star } from 'lucide-react';
import styles from '../styles/NavigationDrawer.module.css';

const NavigationDrawer = ({ isOpen, onClose, userDetails }) => {
    const router = useRouter();
    const pathname = usePathname();

    // Get user level from userDetails, trying multiple possible property names
    const userLevel = parseInt(
        userDetails?.access_level || 
        userDetails?.accessLevel || 
        userDetails?.level ||
        1
    );
    
    // Debug log to check access level
    console.log('User Level Debug:', {
        access_level: userDetails?.access_level,
        accessLevel: userDetails?.accessLevel,
        level: userDetails?.level,
        parsedUserLevel: userLevel,
        userDetails: userDetails
    });

    // Define access levels and their properties
    const accessLevels = {
        1: { 
            icon: '/assets/boy.png',
            color: '#6b7280',
            bgColor: '#f3f4f6'
        },
        2: { 
            icon: '/assets/knight.png', 
            color: '#059669',
            bgColor: '#ecfdf5'
        },
        3: { 
            icon: '/assets/elf.png', 
            color: '#ac7339',
            bgColor: '#dfbf9f'
        },
        50: { 
            icon: '/assets/wizard.png', 
            color: '#ff884d',
            bgColor: '#ffddcc'
        },
        80: { 
            icon: '/assets/valkyrie.png', 
            color: '#a64dff',
            bgColor: '#d9b3ff'
        },
        99: { 
            icon: '/assets/jesus.png',
            color: '#dc2626',
            bgColor: '#fbd0d0'
        }
    };

    const handleNavigation = (path, requiredLevel) => {
        // Check if user has sufficient access level
        if (userLevel < requiredLevel) {
            return; // Don't navigate if access denied
        }
        router.push(path);
        onClose();
    };

    const menuItems = [
        {
            id: 'duty-roster',
            title: '任務交換系統',
            description: '班表查詢&換班申請',
            icon: <Calendar size={24} />,
            path: '/schedule',
            color: '#2563eb',
            requiredLevel: 1
        },
        {
            id: 'mrt-checker',
            title: '休時檢視系統',
            description: '排班模擬器&休時檢視',
            icon: <Clock size={24} />,
            path: '/MRTChecker',
            color: '#059669',
            requiredLevel: 1
        },
        {
            id: 'vacation-planner',
            title: 'GDay劃假系統',
            description: '指定休假申請',
            icon: <MapPin size={24} />,
            path: '/gday',
            color: '#7c3aed',
            requiredLevel: 1
        },
        {
            id: 'etr-generator',
            title: 'eTR產生器',
            description: 'e-"TAHI" Report',
            icon: <NotebookPen size={24} />,
            path: '/etr-generator',
            color: '#dc2626',
            requiredLevel: 2
        },
        {
            id: 'patch-notes',
            title: 'Patch內容',
            description: 'APP更新項目',
            icon: <FileText size={24} />,
            path: '/patch-notes',
            color: '#9bafd9',
            requiredLevel: 1
        }
    ];

    // Get current level info
    const currentLevelInfo = accessLevels[userLevel] || accessLevels[1];

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div 
                    className={styles.drawerBackdrop}
                    onClick={onClose}
                />
            )}
            
            {/* Drawer */}
            <div className={`${styles.navigationDrawer} ${isOpen ? styles.open : ''}`}>
                {/* Header */}
                <div className={styles.drawerHeader}>
                    <div className={styles.drawerUserInfo}>
                        <div className={styles.userAvatarContainer}>
                            <div 
                                className={styles.userAvatar}
                                style={{ 
                                    backgroundColor: currentLevelInfo.bgColor,
                                    color: currentLevelInfo.color,
                                    border: `2px solid ${currentLevelInfo.color}`
                                }}
                            >
                                {/* Render image or fallback text based on icon type */}
                                <img 
                                    src={currentLevelInfo.icon} 
                                    alt={`Level ${userLevel}`}
                                    style={{ width: '90%', height: '90%' }}
                                    onError={(e) => {
                                        // Fallback to text if image fails to load
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'block';
                                    }}
                                />
                                <span style={{ display: 'none' }}>{userLevel}</span>
                            </div>
                            <div 
                                className={styles.userLevelBadge}
                                style={{ 
                                    backgroundColor: currentLevelInfo.color,
                                    color: 'white'
                                }}
                            >
                                {userLevel}
                            </div>
                        </div>
                        <div className={styles.userDetails}>
                            <div className={styles.userName}>{userDetails?.name || 'User'}</div>
                            <div className={styles.userMeta}>
                                {userDetails?.rank} • {userDetails?.base}
                            </div>
                        </div>
                    </div>
                </div>
                
                {/* Navigation Items */}
                <div className={styles.drawerContent}>
                    <div className={styles.drawerSection}>
                        <h3 className={styles.drawerSectionTitle}>應用程式</h3>
                        <div className={styles.drawerMenu}>
                            {menuItems.map((item) => {
                                const isActive = pathname.startsWith(item.path);
                                const hasAccess = userLevel >= item.requiredLevel;
                                
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => handleNavigation(item.path, item.requiredLevel)}
                                        className={`${styles.drawerMenuItem} ${isActive ? styles.active : ''} ${!hasAccess ? styles.disabled : ''}`}
                                        disabled={!hasAccess}
                                    >
                                        <div 
                                            className={styles.menuItemIcon}
                                            style={{ 
                                                color: hasAccess ? item.color : '#9ca3af',
                                                opacity: hasAccess ? 1 : 0.5 
                                            }}
                                        >
                                            {item.icon}
                                        </div>
                                        <div className={styles.menuItemContent}>
                                            <div className={styles.menuItemTitleContainer}>
                                                <div 
                                                    className={styles.menuItemTitle}
                                                    style={{ 
                                                        color: hasAccess ? 'inherit' : '#9ca3af',
                                                        opacity: hasAccess ? 1 : 0.6 
                                                    }}
                                                >
                                                    {item.title}
                                                </div>
                                                {!hasAccess && (
                                                    <div className={styles.accessLevelRequired}>
                                                        需要等級 {item.requiredLevel}+
                                                    </div>
                                                )}
                                            </div>
                                            <div 
                                                className={styles.menuItemDescription}
                                                style={{ 
                                                    color: hasAccess ? 'inherit' : '#9ca3af',
                                                    opacity: hasAccess ? 1 : 0.5 
                                                }}
                                            >
                                                {item.description}
                                            </div>
                                        </div>
                                        {isActive && hasAccess && <div className={styles.menuItemIndicator} />}
                                        {!hasAccess && (
                                            <div className={styles.accessDeniedIcon}>
                                                <Shield size={16} color="#9ca3af" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                
                {/* Footer */}
                <div className={styles.drawerFooter}>
                    <div className={styles.appVersion}>
                        豪神APP v3.1.1
                    </div>
                </div>
            </div>
        </>
    );
};

export default NavigationDrawer;
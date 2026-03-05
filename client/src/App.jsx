import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import SiteView from './components/SiteView';
import TunnelView from './components/TunnelView';

function App() {
    const [user, setUser] = useState(null);
    const [showRegister, setShowRegister] = useState(false);
    const [viewingSiteId, setViewingSiteId] = useState(null);
    const [isTunnelMode, setIsTunnelMode] = useState(false);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const viewId = urlParams.get('view');
        const tunnelId = urlParams.get('tunnel');

        if (viewId) setViewingSiteId(viewId);
        if (tunnelId) {
            setViewingSiteId(tunnelId);
            setIsTunnelMode(true);
        }

        const token = localStorage.getItem('token');
        const username = localStorage.getItem('username');
        if (token && username) {
            setUser({ token, username });
        }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        setUser(null);
    };

    if (user) {
        if (viewingSiteId) {
            if (isTunnelMode) {
                return <TunnelView siteId={viewingSiteId} onExit={() => {
                    const url = new URL(window.location);
                    url.searchParams.delete('tunnel');
                    window.history.pushState({}, '', url);
                    setViewingSiteId(null);
                    setIsTunnelMode(false);
                }} />;
            }
            return <SiteView siteId={viewingSiteId} user={user} onExit={() => {
                const url = new URL(window.location);
                url.searchParams.delete('view');
                window.history.pushState({}, '', url);
                setViewingSiteId(null);
            }} />;
        }
        return <Dashboard user={user} onLogout={handleLogout} onOpenSite={(id) => {
            setViewingSiteId(id);
            setIsTunnelMode(true); // Default to tunnel mode for "Open"
        }} />;
    }

    return (
        <div className="min-h-screen flex bg-slate-950 text-white overflow-hidden">
            {/* Left Side: Image (Hidden on mobile) */}
            <div className="hidden lg:flex lg:w-3/5 relative overflow-hidden">
                <img
                    src="/login_sidebar_bg.png"
                    alt="Portal"
                    className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] flex flex-col items-center justify-center p-12 text-center">
                    <div className="max-w-xl">
                        <h1 className="text-7xl font-black gradient-text mb-6 tracking-tighter">PORTAL</h1>
                        <p className="text-2xl text-slate-200 font-light leading-relaxed">
                            Web sitelerinizi güvenle yönetin, giriş süreçlerini <span className="text-primary-400 font-bold italic">otomatikleştirin.</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Right Side: Form */}
            <div className="w-full lg:w-2/5 flex flex-col justify-center p-8 md:p-16 bg-slate-950 relative">
                <div className="lg:hidden absolute top-8 left-8">
                    <h1 className="text-2xl font-black gradient-text tracking-tighter">PORTAL</h1>
                </div>

                <div className="w-full max-w-md mx-auto">
                    {showRegister ? (
                        <Register onBackToLogin={() => setShowRegister(false)} />
                    ) : (
                        <Login onLogin={setUser} onGoToRegister={() => setShowRegister(true)} />
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;

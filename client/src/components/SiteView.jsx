import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { ChevronLeft, ChevronRight, RotateCw, Monitor, Shield, X, Maximize2, MousePointer2, Keyboard, ExternalLink, Lock } from 'lucide-react';
import api from '../api';

const socket = io();

const SiteView = ({ siteId, user, onExit }) => {
    const [site, setSite] = useState(null);
    const [liveFrame, setLiveFrame] = useState(null);
    const [status, setStatus] = useState('Başlatılıyor...');
    const containerRef = useRef(null);

    useEffect(() => {
        const loadSite = async () => {
            try {
                const res = await api.get('/sites');
                const target = res.data.find(s => s.id === parseInt(siteId));
                if (target) {
                    setSite(target);
                    // Sunucuda tarayıcıyı zorla aç/hazırla
                    api.get(`/sites/${target.id}/open`);
                }
            } catch (e) {
                setStatus('Yükleme Hatası');
            }
        };
        loadSite();
    }, [siteId]);

    useEffect(() => {
        const statusEvent = `site-status-${siteId}`;
        socket.on(statusEvent, (data) => {
            setStatus(data.status);
        });
        return () => {
            socket.off(statusEvent);
        };
    }, [siteId]);

    useEffect(() => {
        const iframe = document.getElementById('tunnel-iframe');
        if (!iframe) return;

        let pollInterval;
        const handleLoad = async () => {
            console.log("[PORTAL] Iframe loaded/changed, starting injection polling...");

            try {
                const res = await api.get(`/sites/${siteId}/credentials`, {
                    headers: { 'X-Portal-Internal': 'true' }
                });
                const { username, password } = res.data;
                if (!username || !password) return;

                // Stop any previous polling
                if (pollInterval) clearInterval(pollInterval);

                let attempts = 0;
                pollInterval = setInterval(() => {
                    attempts++;
                    if (attempts > 50) { // 10 seconds timeout
                        clearInterval(pollInterval);
                        return;
                    }

                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    if (!doc) return;

                    const userSelectors = ['input[type="text"]', 'input[type="email"]', 'input[name*="user" i]', 'input[id*="user" i]', 'input[placeholder*="eposta" i]', 'input[placeholder*="username" i]', 'input[placeholder*="Kullanıcı Adı" i]'];
                    const passSelectors = ['input[type="password"]', 'input[name*="pass" i]', 'input[id*="id" i]', 'input[placeholder*="şifre" i]', 'input[placeholder*="password" i]'];

                    let userInp, passInp;
                    for (const s of userSelectors) { if (userInp = doc.querySelector(s)) break; }
                    for (const s of passSelectors) { if (passInp = doc.querySelector(s)) break; }

                    if (userInp && passInp) {
                        console.log("[PORTAL] Inputs found, filling data...");
                        clearInterval(pollInterval);

                        // React-friendly value setting
                        const setNativeValue = (element, value) => {
                            const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
                            const prototype = Object.getPrototypeOf(element);
                            const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

                            if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
                                prototypeValueSetter.call(element, value);
                            } else {
                                element.value = value;
                            }
                        };

                        setNativeValue(userInp, username);
                        setNativeValue(passInp, password);

                        userInp.dispatchEvent(new Event('input', { bubbles: true }));
                        userInp.dispatchEvent(new Event('change', { bubbles: true }));
                        passInp.dispatchEvent(new Event('input', { bubbles: true }));
                        passInp.dispatchEvent(new Event('change', { bubbles: true }));

                        setTimeout(() => {
                            const submitBtn = doc.querySelector('button[type="submit"]') || doc.querySelector('button[class*="button_primary" i]');
                            const form = userInp.closest('form');

                            if (submitBtn) submitBtn.click();
                            else if (form) form.submit();
                            else passInp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, code: 'Enter', which: 13 }));
                        }, 800);
                    }
                }, 200);
            } catch (err) {
                console.error("[PORTAL] Injection error:", err);
            }
        };

        iframe.addEventListener('load', handleLoad);
        // Force an initial check in case iframe is already loaded
        handleLoad();

        return () => {
            iframe.removeEventListener('load', handleLoad);
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [siteId]);

    const refreshPage = () => {
        const iframe = document.getElementById('tunnel-iframe');
        if (iframe) iframe.src = iframe.src;
    };

    if (!site) return <div className="h-screen bg-slate-950 flex items-center justify-center text-white">Yükleniyor...</div>;

    return (
        <div className="h-screen bg-slate-950 flex flex-col text-white overflow-hidden font-sans">
            {/* Browser Header Overlay */}
            <div className="bg-slate-900 border-b border-slate-800 p-3 flex items-center gap-4 shadow-2xl z-10">
                <div className="flex gap-2">
                    <button onClick={onExit} className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white transition-all bg-slate-950/50 border border-slate-800">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex gap-3 items-center bg-slate-950 border border-slate-800 rounded-2xl px-5 py-2.5 flex-grow mx-2">
                    <Lock size={14} className="text-green-500" />
                    <span className="text-sm font-bold text-slate-300 truncate max-w-xl">{site.url}</span>
                    <div className="flex-grow"></div>
                    <div className="flex items-center gap-2 pr-2">
                        <div className={`w-2 h-2 rounded-full ${status === 'Tamamlandı' ? 'bg-green-500' : 'bg-primary-500 animate-pulse'}`}></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            {status === 'Tamamlandı' ? 'GÜVENLİ BAĞLANTI' : status}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 mr-2">
                    <button onClick={refreshPage} className="p-2.5 hover:bg-slate-800 rounded-xl text-slate-400 bg-slate-950/50 border border-slate-800">
                        <RotateCw size={18} />
                    </button>
                    <a href={site.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 bg-primary-600 hover:bg-primary-500 px-4 py-2.5 rounded-xl font-bold text-xs transition-all">
                        <ExternalLink size={14} /> Sitede Gör
                    </a>
                </div>
            </div>

            {/* Browser Viewport */}
            <div className="flex-grow bg-white relative overflow-hidden">
                <iframe
                    id="tunnel-iframe"
                    src={`/tunnel/${siteId}`}
                    className="w-full h-full border-none bg-white"
                    title="Remote Session"
                    sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin"
                />

                {/* Status Overlay (Fade out if connected) */}
                {status !== 'Tamamlandı' && status !== 'Ziyaret Edildi' && (
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl flex flex-col items-center justify-center gap-8 z-20">
                        <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin shadow-[0_0_30px_-5px_rgba(59,130,246,0.5)]"></div>
                        <div className="text-center">
                            <h2 className="text-2xl font-black mb-2 tracking-tighter uppercase">{status}</h2>
                            <p className="text-slate-500 text-sm font-medium">Bütün bilgileriniz güvenle aktarılıyor...</p>
                        </div>
                    </div>
                )}
            </div>

            {/* User Info Overlay (Bottom Right) */}
            <div className="absolute bottom-8 right-8 bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-700 shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">OTURUM BİLGİSİ</p>
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center font-bold text-xs">{user.username[0].toUpperCase()}</div>
                    <div>
                        <p className="font-bold text-xs">{user.username}</p>
                        <p className="text-[9px] text-slate-400 font-mono">REMOTE-VNC-SECURE</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SiteView;

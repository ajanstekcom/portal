import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { ChevronLeft, ChevronRight, RotateCw, Monitor, Shield, X, Maximize2, MousePointer2, Keyboard, ExternalLink, Lock } from 'lucide-react';
import api from '../api';

const socket = io({
    path: '/socket.io',
    transports: ['polling', 'websocket'],
    autoConnect: true
});

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

    const runSmartLogin = async (manual = false) => {
        const iframe = document.getElementById('tunnel-iframe');
        if (!iframe) {
            console.error("[PORTAL] Iframe bulunamadı!");
            return;
        }

        console.log(`[PORTAL] SmartLogin başlatılıyor... (Manuel: ${manual})`);

        try {
            const res = await api.get(`/sites/${siteId}/credentials`, {
                headers: { 'X-Portal-Internal': 'true' }
            });
            const { username, password } = res.data;
            if (!username || !password) {
                console.warn("[PORTAL] Kimlik bilgileri bulunamadı.");
                return;
            }

            let attempts = 0;
            const maxAttempts = manual ? 1 : 50;

            const poll = setInterval(() => {
                attempts++;
                const doc = iframe.contentDocument || iframe.contentWindow.document;

                if (!doc || doc.readyState === 'loading') {
                    if (attempts >= maxAttempts) clearInterval(poll);
                    return;
                }

                // --- CORS BYPASS INJECTION ---
                if (!doc.getElementById('portal-cors-bypass')) {
                    const script = doc.createElement('script');
                    script.id = 'portal-cors-bypass';
                    script.textContent = `
                        (function() {
                            const originalFetch = window.fetch;
                            window.fetch = function(url, options) {
                                if (typeof url === 'string' && url.startsWith('http') && !url.includes(window.location.host)) {
                                    const proxyUrl = '/api/cors-proxy?url=' + encodeURIComponent(url);
                                    return originalFetch(proxyUrl, options);
                                }
                                return originalFetch(url, options);
                            };
                            const originalOpen = XMLHttpRequest.prototype.open;
                            XMLHttpRequest.prototype.open = function(method, url) {
                                if (typeof url === 'string' && url.startsWith('http') && !url.includes(window.location.host)) {
                                    url = '/api/cors-proxy?url=' + encodeURIComponent(url);
                                }
                                return originalOpen.apply(this, arguments);
                            };
                            console.log("[PORTAL] CORS Bypass aktif.");
                        })();
                    `;
                    doc.head.prepend(script);
                }

                // --- SELECTORS ---
                const userSelectors = ['input[type="text"]', 'input[type="email"]', 'input[name*="user" i]', 'input[id*="user" i]', 'input[placeholder*="eposta" i]', 'input[placeholder*="username" i]', 'input[placeholder*="Kullanıcı" i]'];
                const passSelectors = ['input[type="password"]', 'input[name*="pass" i]', 'input[id*="id" i]', 'input[placeholder*="şifre" i]', 'input[placeholder*="password" i]'];

                let userInp, passInp;
                for (const s of userSelectors) { if (userInp = doc.querySelector(s)) break; }
                for (const s of passSelectors) { if (passInp = doc.querySelector(s)) break; }

                if (!userInp && !passInp) {
                    const allButtons = Array.from(doc.querySelectorAll('button, a, span'));
                    const loginBtn = allButtons.find(el => {
                        const txt = el.textContent.toLowerCase();
                        return txt.includes('admin girişi') || txt.includes('yönetici girişi') || txt.includes('giriş yap') || txt.includes('personel girişi');
                    });

                    if (loginBtn) {
                        console.log("[PORTAL] Başlatma butonu bulundu, tıklanıyor...");
                        loginBtn.click();
                        clearInterval(poll);
                        setTimeout(() => runSmartLogin(false), 1000);
                        return;
                    }
                }

                if (userInp && passInp) {
                    console.log("[PORTAL] Form bulundu, dolduruluyor...");
                    clearInterval(poll);

                    const setNativeValue = (element, value) => {
                        const prototype = Object.getPrototypeOf(element);
                        const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
                        if (valueSetter) valueSetter.call(element, value);
                        else element.value = value;
                    };

                    userInp.focus();
                    setNativeValue(userInp, username);
                    userInp.dispatchEvent(new Event('input', { bubbles: true }));
                    userInp.dispatchEvent(new Event('change', { bubbles: true }));

                    passInp.focus();
                    setNativeValue(passInp, password);
                    passInp.dispatchEvent(new Event('input', { bubbles: true }));
                    passInp.dispatchEvent(new Event('change', { bubbles: true }));

                    setTimeout(() => {
                        const allBtns = Array.from(doc.querySelectorAll('button, input[type="submit"]'));
                        const submitBtn = allBtns.find(el => {
                            const txt = (el.textContent || el.value || '').toLowerCase();
                            return txt.includes('giriş') || txt.includes('login') || txt.includes('oturumu aç') || txt.includes('tamam');
                        });

                        if (submitBtn) {
                            console.log("[PORTAL] Giriş tıklandı.");
                            submitBtn.click();
                        } else {
                            console.log("[PORTAL] Enter gönderildi.");
                            passInp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, keyCode: 13, which: 13 }));
                        }
                    }, 500);
                }

                if (attempts >= maxAttempts) clearInterval(poll);
            }, 500);
        } catch (err) { console.error("[PORTAL] Hata:", err); }
    };

    useEffect(() => {
        const iframe = document.getElementById('tunnel-iframe');
        if (!iframe) return;

        // [USER FIX] Otomatik girişi iptal ettik. Sadece "Botu Çalıştır" butonuyla çalışacak.
        const handleLoad = () => {
            console.log("[PORTAL] Iframe yüklendi, bot manuel tetiklenmeyi bekliyor.");
        };
        iframe.addEventListener('load', handleLoad);

        return () => iframe.removeEventListener('load', handleLoad);
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
                    <button
                        onClick={() => runSmartLogin(true)}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg shadow-indigo-500/20"
                        title="Botu Manuel Çalıştır"
                    >
                        <MousePointer2 size={14} /> Botu Çalıştır
                    </button>
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

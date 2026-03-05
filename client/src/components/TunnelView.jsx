import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, RefreshCw, ExternalLink, ShieldCheck } from 'lucide-react';

const TunnelView = ({ siteId, onExit }) => {
    const tunnelUrl = `/tunnel/${siteId}`;

    useEffect(() => {
        // Tünel çerezini zorla set et (İframe düzgün çalışsın diye)
        document.cookie = `portal_tunnel_id=${siteId}; path=/; max-age=3600; SameSite=Lax`;
    }, [siteId]);

    const refreshIframe = () => {
        const iframe = document.getElementById('tunnel-iframe');
        if (iframe) {
            iframe.src = iframe.src;
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col overflow-hidden">
            {/* Control Bar */}
            <header className="h-16 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 flex items-center justify-between px-6 shrink-0 shadow-2xl">
                <div className="flex items-center gap-4">
                    <div className="bg-primary-500/10 p-2 rounded-lg border border-primary-500/20">
                        <ShieldCheck className="text-primary-400" size={18} />
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-slate-200">Portal Tünel</h2>
                        <p className="text-[10px] text-slate-500 font-mono">ID: {siteId}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={refreshIframe}
                        className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-700/50 active:scale-95 group"
                        title="Sayfayı Yenile"
                    >
                        <RefreshCw size={18} className="group-active:rotate-180 transition-transform duration-500" />
                    </button>

                    <div className="w-[1px] h-6 bg-slate-800 mx-2" />

                    <button
                        onClick={onExit}
                        className="flex items-center gap-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white px-4 py-2.5 rounded-xl font-bold transition-all border border-red-500/20 active:scale-95 group"
                    >
                        <X size={18} />
                        <span className="text-sm">Kapat</span>
                    </button>
                </div>
            </header>

            {/* Iframe Area */}
            <main className="flex-grow bg-white relative">
                <iframe
                    id="tunnel-iframe"
                    src={tunnelUrl}
                    className="w-full h-full border-none"
                    title="Portal Tunnel Content"
                    sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin"
                />
            </main>
        </div>
    );
};

export default TunnelView;

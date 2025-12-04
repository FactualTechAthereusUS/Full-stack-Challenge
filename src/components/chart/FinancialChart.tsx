
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChartData {
    type?: 'bar' | 'line';
    title: string;
    unit: string;
    series: string[];
    data: {
        label: string;
        values: number[];
    }[];
    overlay?: {
        supply_zones?: { start: number; end: number; strength: string; label?: string }[];
        demand_zones?: { start: number; end: number; strength: string; label?: string }[];
        key_levels?: { price: number; label: string }[];
    };
}

const MoreHorizontalIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="1" />
        <circle cx="19" cy="12" r="1" />
        <circle cx="5" cy="12" r="1" />
    </svg>
);

const FinancialChart: React.FC<{ data: ChartData }> = ({ data }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    // Setup Resize Observer for Pixel-Perfect Rendering
    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                setDimensions({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    // Validate Data
    if (!data || !data.data || data.data.length === 0) {
        return (
            <div className="my-6 bg-[#1c1c1e] rounded-2xl border border-gray-800 p-6 h-64 flex items-center justify-center text-gray-500">
                No data available
            </div>
        );
    }

    const isLine = data.type === 'line';

    // Calculate Scales & Ticks
    const allValues = data.data.flatMap(d => d.values || []).filter(v => typeof v === 'number');

    // Include overlay values in scale calculation to ensure they are visible
    if (data.overlay) {
        data.overlay.supply_zones?.forEach(z => { allValues.push(z.start); allValues.push(z.end); });
        data.overlay.demand_zones?.forEach(z => { allValues.push(z.start); allValues.push(z.end); });
        data.overlay.key_levels?.forEach(l => allValues.push(l.price));
    }

    const maxVal = Math.max(...allValues, 0);
    const minVal = Math.min(...allValues, 0);

    const range = maxVal - minVal;
    const chartMax = maxVal + (range * 0.1) || 100;
    const chartMin = minVal < 0 ? minVal - (range * 0.1) : 0;
    const chartHeightVal = chartMax - chartMin;

    const formatValue = (val: number) => {
        const u = (data.unit || '').toLowerCase();
        if (u.includes('%')) return `${val.toFixed(2)}%`;

        let multiplier = 1;
        if (u.includes('trillion')) multiplier = 1e12;
        else if (u.includes('billion')) multiplier = 1e9;
        else if (u.includes('million')) multiplier = 1e6;
        else if (u.includes('thousand')) multiplier = 1e3;

        const raw = val * multiplier;

        // For normal numbers (price, ratio) without explicit magnitude unit
        if (multiplier === 1 && Math.abs(raw) < 10000) {
            return new Intl.NumberFormat('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }).format(raw);
        }

        return new Intl.NumberFormat('en-US', {
            notation: "compact",
            compactDisplay: "short",
            maximumFractionDigits: 1
        }).format(raw);
    };

    const ticks = [0, 0.33, 0.66, 1].map(t => {
        const val = chartMin + (chartHeightVal * t);
        return formatValue(val);
    });

    // Color Logic
    const getSeriesColor = (seriesName: string, index: number) => {
        const name = (seriesName || '').toLowerCase().trim();

        if (name.includes('tesla') || name.includes('tsla')) return '#3b82f6';
        if (name.includes('ford') || name === 'f') return '#fbbf24';
        if (name.includes('general motors') || name.includes('gm')) return '#ef4444';
        if (name.includes('byd')) return '#84cc16';
        if (name.includes('xpeng') || name.includes('xpev')) return '#e5e7eb';

        const palette = ['#3b82f6', '#ef4444', '#fbbf24', '#84cc16', '#a855f7', '#06b6d4'];
        return palette[index % palette.length];
    };

    // Coordinate Math
    const getY = (val: number) => {
        const normalizedVal = val - chartMin;
        return dimensions.height - ((normalizedVal / chartHeightVal) * dimensions.height);
    };

    const getCoordinates = (sIdx: number) => {
        if (dimensions.width === 0) return [];

        return data.data.map((d, i) => {
            const val = d.values[sIdx];
            if (typeof val !== 'number') return null;

            const x = (i * (dimensions.width / data.data.length)) + (dimensions.width / data.data.length / 2);
            const y = getY(val);
            return { x, y, val };
        }).filter(p => p !== null) as { x: number, y: number, val: number }[];
    };

    // Smooth Bezier Path Generator
    const generateSmoothPath = (sIdx: number) => {
        const coords = getCoordinates(sIdx);
        if (coords.length === 0) return '';
        if (coords.length === 1) return `M ${coords[0].x},${coords[0].y} Z`;

        let d = `M ${coords[0].x},${coords[0].y}`;

        for (let i = 0; i < coords.length - 1; i++) {
            const p0 = coords[i];
            const p1 = coords[i + 1];
            const cp1x = p0.x + (p1.x - p0.x) * 0.5;
            const cp1y = p0.y;
            const cp2x = p1.x - (p1.x - p0.x) * 0.5;
            const cp2y = p1.y;
            d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p1.x},${p1.y}`;
        }
        return d;
    };

    const zeroLineY = getY(0);

    return (
        <div className="my-6 bg-[#1c1c1e] dark:bg-[#1c1c1e] rounded-2xl border border-gray-800 p-6 font-sans w-full max-w-3xl shadow-xl select-none relative overflow-hidden">

            {/* Header & Legend */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-6 gap-4">
                <div>
                    <h3 className="text-lg md:text-xl font-bold text-white tracking-tight">{data.title}</h3>
                    <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-wide">{data.unit}</p>
                </div>

                <div className="flex flex-wrap gap-3 items-center justify-end max-w-full sm:max-w-[60%]">
                    {data.series.map((seriesName, idx) => (
                        <div key={idx} className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-full ring-1 ring-white/10" style={{ backgroundColor: getSeriesColor(seriesName, idx) }}></div>
                            <span className="text-[11px] text-gray-400 font-medium truncate max-w-[100px]">{seriesName}</span>
                        </div>
                    ))}
                    {data.overlay && (
                        <>
                            {data.overlay.supply_zones && data.overlay.supply_zones.length > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-sm bg-red-500/20 border border-red-500/50"></div>
                                    <span className="text-[11px] text-gray-400 font-medium">Supply</span>
                                </div>
                            )}
                            {data.overlay.demand_zones && data.overlay.demand_zones.length > 0 && (
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-sm bg-green-500/20 border border-green-500/50"></div>
                                    <span className="text-[11px] text-gray-400 font-medium">Demand</span>
                                </div>
                            )}
                        </>
                    )}
                    <button className="text-gray-600 hover:text-white transition-colors ml-1">
                        <MoreHorizontalIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Chart Layout */}
            <div className="relative h-64 w-full flex pl-0">

                {/* Y-Axis Labels */}
                <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] font-mono font-medium text-gray-600 z-10 pointer-events-none w-8">
                    {ticks.reverse().map((tick, i) => (
                        <span key={i} className="-translate-y-1/2 text-right">{tick}</span>
                    ))}
                </div>

                {/* Plotting Area */}
                <div className="relative flex-1 ml-10 border-b border-gray-800/50">

                    {/* Grid Lines */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                        {ticks.map((_, i) => (
                            <div key={i} className="w-full border-t border-gray-800/30 h-0" />
                        ))}
                    </div>

                    {/* Zero Line */}
                    {minVal < 0 && zeroLineY >= 0 && zeroLineY <= dimensions.height && (
                        <div className="absolute w-full border-t border-gray-600/50 h-0 z-0" style={{ top: zeroLineY }} />
                    )}

                    {/* Render Container */}
                    <div ref={containerRef} className="absolute inset-0 z-20">
                        {dimensions.width > 0 && dimensions.height > 0 && (
                            <>
                                {/* Overlay: Zones */}
                                {data.overlay?.supply_zones?.map((zone, i) => {
                                    const top = getY(zone.end);
                                    const bottom = getY(zone.start);
                                    const height = Math.abs(bottom - top);
                                    return (
                                        <div key={`supply-${i}`} className="absolute w-full bg-red-500/10 border-y border-red-500/30 flex items-center justify-end pr-2"
                                            style={{ top, height }}>
                                            {zone.label && <span className="text-[9px] text-red-400 font-mono uppercase tracking-wider">{zone.label}</span>}
                                        </div>
                                    );
                                })}
                                {data.overlay?.demand_zones?.map((zone, i) => {
                                    const top = getY(zone.end);
                                    const bottom = getY(zone.start);
                                    const height = Math.abs(bottom - top);
                                    return (
                                        <div key={`demand-${i}`} className="absolute w-full bg-green-500/10 border-y border-green-500/30 flex items-center justify-end pr-2"
                                            style={{ top, height }}>
                                            {zone.label && <span className="text-[9px] text-green-400 font-mono uppercase tracking-wider">{zone.label}</span>}
                                        </div>
                                    );
                                })}

                                {/* Overlay: Key Levels */}
                                {data.overlay?.key_levels?.map((level, i) => {
                                    const top = getY(level.price);
                                    return (
                                        <div key={`level-${i}`} className="absolute w-full border-t border-dashed border-yellow-500/50 flex items-center justify-end pr-2"
                                            style={{ top }}>
                                            <span className="text-[9px] text-yellow-500 font-mono -mt-4 bg-[#1c1c1e]/80 px-1 rounded">{level.label} @ {level.price}</span>
                                        </div>
                                    );
                                })}

                                {/* SVG Layer */}
                                {isLine && (
                                    <svg className="w-full h-full overflow-visible" style={{ vectorEffect: 'non-scaling-stroke' }}>
                                        {data.series.map((seriesName, sIdx) => (
                                            <motion.path
                                                key={sIdx}
                                                d={generateSmoothPath(sIdx)}
                                                fill="none"
                                                stroke={getSeriesColor(seriesName, sIdx)}
                                                strokeWidth="3"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                initial={{ pathLength: 0, opacity: 0 }}
                                                animate={{ pathLength: 1, opacity: 1 }}
                                                transition={{ duration: 1.5, ease: "easeOut" }}
                                            />
                                        ))}
                                    </svg>
                                )}

                                {/* Data Points & Interactions */}
                                {data.data.map((item, idx) => {
                                    return (
                                        <div
                                            key={idx}
                                            className="absolute top-0 bottom-0 w-full group outline-none"
                                            style={{
                                                left: `${idx * (100 / data.data.length)}%`,
                                                width: `${100 / data.data.length}%`
                                            }}
                                            onMouseEnter={() => setHoveredIndex(idx)}
                                            onMouseLeave={() => setHoveredIndex(null)}
                                        >
                                            {/* Crosshair */}
                                            {isLine && (
                                                <div className={`absolute top-0 bottom-0 left-1/2 w-[1px] bg-white/20 -translate-x-1/2 transition-opacity duration-200 ${hoveredIndex === idx ? 'opacity-100' : 'opacity-0'}`} />
                                            )}

                                            {/* Render Dots/Bars */}
                                            {data.series.map((seriesName, sIdx) => {
                                                const val = item.values[sIdx];
                                                if (typeof val !== 'number') return null;
                                                const color = getSeriesColor(seriesName, sIdx);

                                                const yPos = getY(val);

                                                if (isLine) {
                                                    return (
                                                        <motion.div
                                                            key={sIdx}
                                                            className="absolute w-[9px] h-[9px] rounded-full border-[2px] border-[#1c1c1e] z-30 pointer-events-none"
                                                            style={{
                                                                backgroundColor: color,
                                                                left: '50%',
                                                                top: yPos,
                                                                transform: 'translate(-50%, -50%)'
                                                            }}
                                                            initial={{ scale: 0 }}
                                                            animate={{ scale: hoveredIndex === idx ? 1.5 : 0 }}
                                                            transition={{ duration: 0.2 }}
                                                        />
                                                    );
                                                } else {
                                                    const barWidthPct = 80 / data.series.length;
                                                    const barLeftOffset = (sIdx - (data.series.length - 1) / 2) * barWidthPct;

                                                    const isNegative = val < 0;
                                                    const barHeight = Math.abs((val / chartHeightVal) * dimensions.height);
                                                    const barTop = isNegative ? zeroLineY : zeroLineY - barHeight;

                                                    return (
                                                        <motion.div
                                                            key={sIdx}
                                                            initial={{ height: 0 }}
                                                            animate={{ height: barHeight, top: barTop }}
                                                            transition={{ duration: 0.8, delay: idx * 0.05 }}
                                                            className="absolute rounded-sm z-20 pointer-events-none"
                                                            style={{
                                                                backgroundColor: color,
                                                                width: `${barWidthPct}%`,
                                                                left: `calc(50% + ${barLeftOffset}%)`,
                                                                transform: 'translateX(-50%)'
                                                            }}
                                                        />
                                                    );
                                                }
                                            })}

                                            {/* Tooltip */}
                                            <AnimatePresence>
                                                {hoveredIndex === idx && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 5, scale: 0.95 }}
                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                        exit={{ opacity: 0, y: 5, scale: 0.95 }}
                                                        transition={{ duration: 0.15 }}
                                                        className={`absolute bottom-full mb-3 z-50 min-w-[180px] pointer-events-none ${idx > data.data.length / 2 ? 'right-0' : 'left-1/2 -translate-x-1/2'
                                                            }`}
                                                    >
                                                        <div className="bg-[#18181b]/95 border border-white/10 text-white rounded-xl shadow-2xl p-3 backdrop-blur-md">
                                                            <div className="text-gray-400 text-[11px] font-bold mb-2 border-b border-white/10 pb-1">
                                                                {item.label}
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                {item.values
                                                                    .map((val, vIdx) => ({
                                                                        val,
                                                                        label: data.series[vIdx],
                                                                        color: getSeriesColor(data.series[vIdx], vIdx)
                                                                    }))
                                                                    .sort((a, b) => b.val - a.val)
                                                                    .map((entry, i) => (
                                                                        <div key={i} className="flex justify-between items-center gap-3">
                                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }}></div>
                                                                                <span className="text-[11px] font-medium text-gray-300 truncate">{entry.label}</span>
                                                                            </div>
                                                                            <span className="text-[11px] font-mono font-bold text-white">
                                                                                {typeof entry.val === 'number' ? formatValue(entry.val) : '-'}
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                            </div>
                                                        </div>
                                                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-[5px] border-transparent border-t-[#18181b]/95"></div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* X-Axis Labels */}
            <div className="flex justify-around px-0 ml-10 mt-2">
                {data.data.map((item, idx) => (
                    <span
                        key={idx}
                        className={`text-[10px] font-mono transition-colors duration-200 ${hoveredIndex === idx
                            ? 'text-white font-bold'
                            : 'text-gray-500'
                            }`}
                    >
                        {item.label}
                    </span>
                ))}
            </div>
        </div>
    );
};

export default FinancialChart;

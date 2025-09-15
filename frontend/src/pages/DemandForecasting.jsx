import React, { useState, useEffect } from 'react';
import { useBusinessInfo } from '../context/BusinessInfoContext.jsx';
import '@fortawesome/fontawesome-free/css/all.min.css';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  TimeScale,
  Filler,
  Title,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { Bar, Pie, Line } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, LineElement, PointElement, TimeScale, Filler, Title, ChartTooltip, ChartLegend, ChartDataLabels);

const bottomLabelsPlugin = {
  id: 'bottomLabels',
  afterDatasetsDraw(chart) {
    const opts = chart.options?.plugins?.bottomLabels;
    if (!opts || opts.display === false) return;
    if (chart.config?.type !== 'bar') return;

    const { ctx, chartArea } = chart;
    const datasetIndex = opts.datasetIndex ?? 0;
    const meta = chart.getDatasetMeta(datasetIndex);
    const rawData = chart.data?.datasets?.[datasetIndex]?.data || [];

    if (!meta || !meta.data) return;

    const root = document.documentElement;
    const color = (opts.color || getComputedStyle(root).getPropertyValue('--muted-foreground') || '#9ca3af').trim();
    const fontSize = opts.font?.size || 11;
    const fontWeight = opts.font?.weight || '600';
    const fontFamily = opts.font?.family || 'Inter, sans-serif';
    const offset = opts.offset ?? -2;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = color;
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

    meta.data.forEach((bar, i) => {
      const v = rawData[i];
      if (v === null || v === undefined || typeof v !== 'number' || Number.isNaN(v)) return;
      const x = bar.x;
      const yBase = bar.base !== undefined ? bar.base : chart.scales?.y?.bottom;
  const y = Math.min(yBase, chartArea.bottom - 2) + offset;
      const text = `${Math.round(v)}%`;
      ctx.fillText(text, x, y);
    });

    ctx.restore();
  },
};

ChartJS.register(bottomLabelsPlugin);

const SuggestionPanel = ({ suggestions }) => {
  const items = Array.isArray(suggestions) ? suggestions.slice(0, 4) : [];
  return (
    <div>
      <p className="text-sm text-[--muted-foreground] mb-2">AI-powered, tailored to your profile</p>
      <ul className="list-disc pl-5 space-y-2">
        {items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
};

const DemandForecasting = () => {
  const { businessInfo } = useBusinessInfo();

  const [forecastPeriod, setForecastPeriod] = useState(6);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [error, setError] = useState(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [history, setHistory] = useState([]);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  

  const palette = (() => {
    const root = document.documentElement;
    const getVar = (name, fallback) => {
      const v = getComputedStyle(root).getPropertyValue(name).trim();
      return v || fallback;
    };
    const col1 = getVar('--chart-1', '#86a7c8');
    const col2 = getVar('--chart-2', '#eea591');
    const col3 = getVar('--chart-3', '#5a7ca6');
    const col4 = getVar('--chart-4', '#466494');
    const col5 = getVar('--chart-5', '#334c82');
    const colors = [col1, col2, col3, col4, col5];
    const withAlpha = (hex, a = '80') => (/^#([0-9a-fA-F]{6})$/.test(hex) ? hex + a : hex);
    return {
      colors,
      bg: (i) => withAlpha(colors[i % colors.length], '80'),
      solid: (i) => colors[i % colors.length],
      hoverBg: (i) => colors[i % colors.length],
      border: (i) => colors[i % colors.length],
    };
  })();

  const truncate = (s, n = 14) => {
    if (!s) return '';
    const str = String(s);
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  };
  const fmtDate = (d) => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return String(d);
    }
  };
  const fmtDateShort = (d) => {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return String(d);
    }
  };
  const historyOptionLabel = (h, isLatest = false) => {
    const date = fmtDateShort(h?.forecast_date);
    const parts = [
      `#${h.id}`,
      h.business_type,
      h.location,
      h.period,
      date ? date : null,
    ].filter(Boolean);
    return (isLatest ? 'Latest · ' : '') + parts.join(' · ');
  };

  const SkeletonCard = ({ height = 260 }) => (
    <div className="bg-[--sidebar] p-4 rounded-[var(--radius)] border border-[--border] shadow">
      <div className="animate-pulse">
        <div className="h-4 w-40 bg-[--border] rounded mb-4" />
        <div className="w-full rounded bg-[--border]" style={{ height }} />
      </div>
    </div>
  );

  const hexToRgba = (hex, alpha = 0.25) => {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    const m = hex.trim().match(/^#?([\da-fA-F]{2})([\da-fA-F]{2})([\da-fA-F]{2})/);
    if (!m) return `rgba(0,0,0,${alpha})`;
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  const makeVerticalGradient = (ctx, colorHex, alphaTop = 0.3, alphaBottom = 0.05) => {
    const chart = ctx.chart;
    const area = chart?.chartArea;
    if (!area) return hexToRgba(colorHex, (alphaTop + alphaBottom) / 2);
    const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
    g.addColorStop(0, hexToRgba(colorHex, alphaTop));
    g.addColorStop(1, hexToRgba(colorHex, alphaBottom));
    return g;
  };

  const StatusAnnounce = ({ loading, error }) => (
    <div aria-live="polite" role="status" className="sr-only">
      {loading ? 'Generating forecast…' : error ? `Error: ${error}` : ''}
    </div>
  );

  const timelineData = React.useMemo(() => {
    if (!forecast) return null;
    const seasons = (forecast.seasonal_demands?.chart || []).map((s) => ({
      name: s.season,
      start: new Date(s.start),
      end: new Date(s.end),
    }));
    const seasonNames = Array.from(new Set(seasons.map((s) => s.name)));
    const festivals = (forecast.festival_demands?.chart || []).map((f) => ({
      label: f.festival,
      date: new Date(f.date),
      inc: Number(f.demand_increase) || 0,
    }));
    const minDate = new Date(
      Math.min(
        ...[
          ...seasons.map((s) => s.start.getTime()),
          ...seasons.map((s) => s.end.getTime()),
          ...festivals.map((f) => f.date.getTime()),
          new Date(forecast.forecast_start).getTime(),
        ],
      ),
    );
    const maxDate = new Date(
      Math.max(
        ...[
          ...seasons.map((s) => s.end.getTime()),
          ...festivals.map((f) => f.date.getTime()),
          new Date(forecast.forecast_end).getTime(),
        ],
      ),
    );
    const yLabels = [...seasonNames, 'Festivals'];
    return { seasons, festivals, yLabels, minDate, maxDate };
  }, [forecast]);

  const coordinationSeries = React.useMemo(() => {
    if (!forecast) return null;
    const start = new Date(forecast.forecast_start);
    const end = new Date(forecast.forecast_end);
    if (!(start.getTime() < end.getTime())) return null;

    const weeks = [];
    let cursor = new Date(start);
    while (cursor <= end) {
      weeks.push(new Date(cursor));
      cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    const seasons = (forecast.seasonal_demands?.chart || []).map((s) => ({
      start: new Date(s.start).getTime(),
      end: new Date(s.end).getTime(),
      surge: Number(s.demand_surge) || 0,
    }));

    const festivals = (forecast.festival_demands?.chart || []).map((f) => ({
      date: new Date(f.date).getTime(),
      inc: Number(f.demand_increase) || 0,
    }));

    const weekLabels = weeks.map((d) => d);

    const seasonVals = weeks.map((w) => {
      const wStart = w.getTime();
      const wEnd = wStart + 7 * 24 * 60 * 60 * 1000 - 1;
      let maxSurge = 0;
      for (const s of seasons) {
        const overlap = !(s.end < wStart || s.start > wEnd);
        if (overlap) maxSurge = Math.max(maxSurge, s.surge);
      }
      return Math.max(0, Math.min(100, maxSurge));
    });

    const festValsRaw = weeks.map((w) => {
      const wStart = w.getTime();
      const wEnd = wStart + 7 * 24 * 60 * 60 * 1000 - 1;
      let sum = 0;
      for (const f of festivals) {
        if (f.date >= wStart && f.date <= wEnd) sum += f.inc;
      }
      return sum;
    });
    const festVals = festValsRaw.map((v) => Math.max(0, Math.min(100, v)));

    const smooth = (arr, window = 3) => {
      const half = Math.floor(window / 2);
      return arr.map((_, i) => {
        let sum = 0;
        let cnt = 0;
        for (let j = i - half; j <= i + half; j++) {
          if (j >= 0 && j < arr.length) {
            sum += arr[j];
            cnt++;
          }
        }
        return cnt ? sum / cnt : arr[i];
      });
    };

    const seasonSm = smooth(seasonVals, 3);
    const festSm = smooth(festVals, 3);
    const coordIndex = seasonSm.map((v, i) => Math.min(v, festSm[i] ?? 0));

    return { labels: weekLabels, seasonVals: seasonSm, festVals: festSm, coordIndex };
  }, [forecast]);

  
  const downloadEntireForecastPDF = async () => {
    if (!forecast) return;
  const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 40;
    let y = margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Demand Forecast Report', margin, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(`Window: ${forecast.forecast_start} to ${forecast.forecast_end}`, margin, y);
    y += 16;
    if (forecast.confidence_score !== undefined) {
      doc.text(`Confidence Score: ${Math.round(forecast.confidence_score * 100) / 100}`, margin, y);
      y += 16;
    }

    const sectionGap = 18;

    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Top Products', margin, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [['#', 'Product', 'Demand %']],
      body: (forecast.product_demands || []).map((p, i) => [i + 1, p.product, `${p.demand_percentage}%`]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [51, 76, 130] },
      margin: { left: margin, right: margin },
    });
    const productTableEnd = doc.lastAutoTable.finalY;
    const reasons = (forecast.product_demands || []).map((p, i) => `${i + 1}. ${p.reason || ''}`).filter(Boolean);
    if (reasons.length) {
      let ry = productTableEnd + 10;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      reasons.forEach((line) => {
        const lines = doc.splitTextToSize(line, 520);
        doc.text(lines, margin, ry);
        ry += lines.length * 12 + 2;
      });
      y = ry + 6;
    } else {
      y = productTableEnd + sectionGap;
    }
    y = doc.lastAutoTable.finalY + sectionGap;

    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Festival Demand Increase', margin, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [['Festival', 'Date', 'Month', 'Year', 'Increase %']],
      body: ((forecast.festival_demands && forecast.festival_demands.chart) || []).map((d) => [
        d.festival,
        d.date,
        d.month,
        d.year,
        `${d.demand_increase}%`,
      ]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [130, 78, 70] },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + sectionGap;

    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Seasonal Demand Surge', margin, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [['Season', 'Start', 'End', 'Surge %']],
      body: ((forecast.seasonal_demands && forecast.seasonal_demands.chart) || []).map((d) => [
        d.season,
        d.start,
        d.end,
        `${d.demand_surge}%`,
      ]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [70, 100, 148] },
      margin: { left: margin, right: margin },
    });
    y = doc.lastAutoTable.finalY + sectionGap;

    
    const suggestions = Array.isArray(forecast.suggestions) ? forecast.suggestions.slice(0, 4) : [];
    if (suggestions.length) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Suggestions', margin, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      suggestions.forEach((s, i) => {
        const text = `${i + 1}. ${s}`;
        const lines = doc.splitTextToSize(text, 520);
        doc.text(lines, margin, y);
        y += lines.length * 14 + 4;
      });
    }

    const filename = `forecast_${forecast.forecast_start}_to_${forecast.forecast_end}.pdf`;
    doc.save(filename);
  };
  

  const handleForecast = async (overridePeriod) => {
    const period = overridePeriod ?? forecastPeriod;
    if (overridePeriod !== undefined) setForecastPeriod(overridePeriod);

    const hadForecast = !!forecast;
    if (hadForecast) setOverlayLoading(true);
    setLoading(!hadForecast);
    setError(null);
    window.dispatchEvent(new Event('demandForecast:loading'));
    try {
      const response = await fetch('/api/demand/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...businessInfo, forecastPeriod: period })
      });
      const result = await response.json();
      if (result.success) {
        setForecast(result.forecast);
  try { if (result.forecastId) sessionStorage.setItem('lastForecastId', String(result.forecastId)); } catch { /* ignore storage */ }
        try {
          const h = await fetch('/api/demand/forecast-history?limit=10');
          const hist = await h.json().catch(() => ({}));
          const items = Array.isArray(hist?.history) ? hist.history : [];
          const sorted = [...items].sort((a, b) => {
            const ta = a?.forecast_date ? new Date(a.forecast_date).getTime() : 0;
            const tb = b?.forecast_date ? new Date(b.forecast_date).getTime() : 0;
            if (tb !== ta) return tb - ta;
            return (b.id || 0) - (a.id || 0);
          });
          setHistory(sorted);
  } catch { /* ignore history refresh error */ }
        setLastUpdated(new Date());
      } else {
        setError(result.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error generating forecast:', error);
      setError(error?.message || 'Network error');
    } finally {
      setLoading(false);
      setOverlayLoading(false);
      window.dispatchEvent(new Event('demandForecast:idle'));
    }
  };

  const loadForecastById = async (id) => {
    if (!id) return;
    setSelectedId(String(id));
    setOverlayLoading(true);
    try {
      const resp = await fetch(`/api/demand/forecast/${id}`);
      const data = await resp.json();
      if (data?.success && data?.forecast) {
        setForecast(data.forecast);
  try { sessionStorage.setItem('lastForecastId', String(id)); } catch { /* ignore storage */ }
        setLastUpdated(new Date());
      }
    } catch {
      // ignore load error; non-critical background fetch
    } finally {
      setOverlayLoading(false);
    }
  };

  useEffect(() => {
    const onTrigger = (ev) => {
      const p = ev?.detail?.forecastPeriod;
      handleForecast(p);
    };
    window.addEventListener('demandForecast:trigger', onTrigger);
    return () => window.removeEventListener('demandForecast:trigger', onTrigger);
  }, []);

  useEffect(() => {
    const loadMostRecentForecast = async () => {
      if (bootstrapped || forecast || loading) return;
      try {
        setLoading(true);
        setError(null);
        const h = await fetch('/api/demand/forecast-history?limit=10');
        const hist = await h.json().catch(() => ({}));
        const items = Array.isArray(hist?.history) ? hist.history : [];
        const sorted = [...items].sort((a, b) => {
          const ta = a?.forecast_date ? new Date(a.forecast_date).getTime() : 0;
          const tb = b?.forecast_date ? new Date(b.forecast_date).getTime() : 0;
          if (tb !== ta) return tb - ta;
          return (b.id || 0) - (a.id || 0);
        });
        setHistory(sorted);
        const last = sorted.length > 0 ? sorted[0] : null;
  let preferredId = null;
  try { preferredId = sessionStorage.getItem('lastForecastId'); } catch { /* ignore storage */ }
        const toLoadId = preferredId || (last && last.id);
        if (toLoadId) setSelectedId(String(toLoadId));
        if (toLoadId) await loadForecastById(toLoadId);
      } catch {
        // ignore bootstrap fetch failure
      } finally {
        setBootstrapped(true);
        setLoading(false);
      }
    };
    loadMostRecentForecast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!businessInfo) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: 32, textAlign: 'center' }}>
        <h3>Please enter your business info in Settings first.</h3>
      </div>
    );
  }

  const festivalItems = (forecast?.festival_demands?.chart || []);
  const festivalLabels = festivalItems.map((d) => d.festival || '');
  const festivalLabelsTrunc = festivalLabels.map((l) => truncate(l, 14));


  return (
  <div className="w-full p-3 sm:p-4">
    <StatusAnnounce loading={loading} error={error} />
      

      {loading && !forecast && (
        <>
          <div className="mb-4">
            <SkeletonCard height={80} />
          </div>
          <div className="mb-4">
            <SkeletonCard height={260} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <SkeletonCard height={300} />
            <SkeletonCard height={320} />
          </div>
          <div className="mt-4">
            <SkeletonCard height={240} />
          </div>
        </>
      )}

      {!loading && !forecast && (
        <div className="bg-[--sidebar] p-6 rounded-[var(--radius)] border border-[--border] shadow text-center">
          <h3 className="text-lg font-semibold mb-2">No forecast yet</h3>
          <p className="text-[--muted-foreground] mb-4">Run a forecast from the navbar to see results.</p>
          {error && <p className="text-red-400 mb-4">{String(error)}</p>}
          <button
            className="px-4 py-2 rounded-md font-semibold bg-[--primary] text-[--primary-foreground] hover:-translate-y-0.5 transition"
            onClick={() => handleForecast(forecastPeriod)}
          >
            Retry Forecast
          </button>
        </div>
      )}

      {forecast && (
        <>
          <div className="bg-[--sidebar] p-4 rounded-[var(--radius)] border border-[--border] shadow mb-4">
            <div style={{ color: 'var(--muted-foreground)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div>
                  <strong>Forecast of {forecastPeriod} Months from </strong>
                  {fmtDate(forecast.forecast_start)}
                  <strong> to </strong>
                  {fmtDate(forecast.forecast_end)}
                </div>
                <div style={{ fontSize: 13 }}>
                  Festivals: {forecast.festival_demands?.chart?.length || 0} · Seasons: {forecast.seasonal_demands?.chart?.length || 0}
                  {lastUpdated && (
                    <span style={{ marginLeft: 8, color: 'var(--foreground)' }}>
                      · Last updated: {fmtDate(lastUpdated)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <div>
                  <label htmlFor="recent-forecasts" className="sr-only">Recent Forecasts</label>
                  <select
                    id="recent-forecasts"
                    className="px-2 py-2 rounded-md bg-transparent border border-[--border] text-[--foreground]"
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) loadForecastById(id);
                    }}
                    value={selectedId || ''}
                  >
                    <option value="" disabled>
                      {history?.length ? 'Load previous…' : 'No previous forecasts'}
                    </option>
                    {history?.map((h, idx) => {
                      const label = historyOptionLabel(h, idx === 0);
                      return (
                        <option key={h.id} value={h.id}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <button className="px-4 py-2 rounded-md font-semibold bg-[--primary] text-[--primary-foreground] hover:-translate-y-0.5 transition" onClick={downloadEntireForecastPDF}>
                  Download Forecast PDF
                </button>
              </div>
            </div>
          </div>

          <div className="bg-[--sidebar] p-4 rounded-[var(--radius)] border border-[--border] shadow">
            <h3>Festival Demand Increase (%)</h3>
            <div style={{ width: '100%', height: 260 }}>
              <Bar
                data={{
                  labels: festivalLabelsTrunc,
                  datasets: [
                    {
                      label: '',
                      data: festivalItems.map(d => d.demand_increase),
                      backgroundColor: festivalItems.map((_, i) => palette.bg(i)),
                      borderColor: festivalItems.map((_, i) => palette.border(i)),
                      borderWidth: 2,
                      borderRadius: 6,
                      borderSkipped: false,
                      hoverBackgroundColor: festivalItems.map((_, i) => palette.hoverBg(i)),
                      hoverBorderWidth: 3,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  animation: {
                    duration: 1000,
                    easing: 'easeInOutQuart',
                  },
                  interaction: {
                    mode: 'nearest',
                    intersect: true,
                    axis: 'x'
                  },
                  plugins: {
                    bottomLabels: {
                      display: true,
                      color: getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground') || '#9ca3af',
                      font: { size: 11, weight: '600' },
                      offset: -2,
                    },
                    datalabels: { display: false },
                    legend: { display: false },
                    tooltip: {
                      backgroundColor: 'rgba(17, 24, 39, 0.95)',
                      titleColor: '#f3f4f6',
                      bodyColor: '#f3f4f6',
                      borderColor: getComputedStyle(document.documentElement).getPropertyValue('--border') || '#374151',
                      borderWidth: 1,
                      cornerRadius: 8,
                      displayColors: false,
                      titleFont: { size: 14, weight: 'bold' },
                      bodyFont: { size: 13 },
                      padding: 12,
                      callbacks: {
                        title: function(context) {
                          const idx = context?.[0]?.dataIndex ?? 0;
                          return festivalLabels[idx] || context?.[0]?.label || '';
                        },
                        label: function(context) {
                          return `${context.parsed.y}%`;
                        }
                      }
                    },
                    title: { display: false },
                  },
                  scales: {
                    x: {
                      ticks: { 
                        color: getComputedStyle(document.documentElement).getPropertyValue('--foreground') || '#e5e7eb', 
                        maxRotation: 30, 
                        minRotation: 30,
                        font: { size: 11 }
                      },
                      grid: { 
                        color: getComputedStyle(document.documentElement).getPropertyValue('--border') + '40' || '#37415140',
                        drawBorder: false,
                      },
                      border: { display: false },
                    },
                    y: {
                      ticks: { 
                        color: getComputedStyle(document.documentElement).getPropertyValue('--foreground') || '#e5e7eb',
                        font: { size: 11 },
                        callback: function(value) {
                          return value + '%';
                        }
                      },
                      grid: { 
                        color: getComputedStyle(document.documentElement).getPropertyValue('--border') + '40' || '#37415140',
                        drawBorder: false,
                      },
                      border: { display: false },
                      beginAtZero: true,
                    },
                  },
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <div className="bg-[--sidebar] p-4 rounded-[var(--radius)] border border-[--border] shadow">
              <h3>Seasonal Demand Surge (%)</h3>
              <div style={{ width: '100%', height: 300 }}>
                <Pie
                  data={{
                    labels: (forecast.seasonal_demands?.chart || []).map(d => d.season),
                    datasets: [
                      {
                        label: 'Demand Surge',
                        data: (forecast.seasonal_demands?.chart || []).map(d => d.demand_surge),
                        backgroundColor: (forecast.seasonal_demands?.chart || []).map((_, i) => palette.bg(i)),
                        borderColor: (forecast.seasonal_demands?.chart || []).map((_, i) => palette.border(i)),
                        borderWidth: 2,
                      },
                    ],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        titleColor: '#f3f4f6',
                        bodyColor: '#f3f4f6',
                        borderColor: getComputedStyle(document.documentElement).getPropertyValue('--border') || '#374151',
                        borderWidth: 1,
                        cornerRadius: 8,
                        callbacks: {
                          label: (ctx) => {
                            const vals = ctx.dataset.data || [];
                            const total = vals.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0) || 1;
                            const pct = Math.round(((ctx.parsed || 0) / total) * 100);
                            return `${ctx.label}: ${ctx.parsed}% (${pct}%)`;
                          },
                        },
                      },
                      datalabels: {
                        display: true,
                        color: '#ffffff',
                        formatter: (value, ctx) => {
                          const vals = ctx.dataset.data || [];
                          const total = vals.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0) || 1;
                          const pct = Math.round(((value || 0) / total) * 100);
                          const label = ctx.chart?.data?.labels?.[ctx.dataIndex] || '';
                          return [label, `${pct}%`];
                        },
                        font: { weight: '700', size: 11 },
                        align: 'center',
                        clamp: true,
                        clip: false,
                      },
                    },
                    scales: {},
                  }}
                />
              </div>
            </div>
            {timelineData && coordinationSeries && (
              <div className="bg-[--sidebar] p-4 rounded-[var(--radius)] border border-[--border] shadow">
                <h3>Timeline of Festive and Seasonal Demands</h3>
                <div style={{ width: '100%', height: 320 }}>
                  <Line
                    data={{
                      datasets: [
                        {
                          type: 'line',
                          label: 'Seasonal Intensity',
                          data: coordinationSeries.seasonVals.map((v, i) => ({ x: coordinationSeries.labels[i]?.getTime?.() ? coordinationSeries.labels[i].getTime() : coordinationSeries.labels[i], y: v })),
                          parsing: false,
                          borderColor: palette.solid(3),
                          backgroundColor: (context) => makeVerticalGradient(context, palette.solid(3), 0.55, 0.12),
                          borderWidth: 2,
                          tension: 0.4,
                          fill: 'origin',
                          pointRadius: 0,
                          pointHoverRadius: 4,
                          pointHitRadius: 10,
                          borderCapStyle: 'round',
                          order: 1,
                        },
                        {
                          type: 'line',
                          label: 'Festival Intensity',
                          data: coordinationSeries.festVals.map((v, i) => ({ x: coordinationSeries.labels[i]?.getTime?.() ? coordinationSeries.labels[i].getTime() : coordinationSeries.labels[i], y: v })),
                          parsing: false,
                          borderColor: palette.solid(1),
                          backgroundColor: (context) => makeVerticalGradient(context, palette.solid(1), 0.55, 0.12),
                          borderWidth: 2,
                          tension: 0.4,
                          fill: 'origin',
                          pointRadius: 0,
                          pointHoverRadius: 4,
                          pointHitRadius: 10,
                          borderCapStyle: 'round',
                          order: 0,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      interaction: { mode: 'nearest', intersect: false, axis: 'x' },
                      scales: {
                        x: {
                          type: 'time',
                          distribution: 'linear',
                          time: { unit: 'week', stepSize: 1, round: 'week', tooltipFormat: 'PP' },
                          ticks: { source: 'data', color: getComputedStyle(document.documentElement).getPropertyValue('--foreground') || '#e5e7eb', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
                          offset: false,
                          bounds: 'data',
                          grid: { color: (getComputedStyle(document.documentElement).getPropertyValue('--border') + '30') || '#37415130', drawBorder: false },
                          border: { display: false },
                        },
                        y: {
                          beginAtZero: true,
                          suggestedMax: 100,
                          max: 100,
                          ticks: { color: getComputedStyle(document.documentElement).getPropertyValue('--foreground') || '#e5e7eb', callback: (v) => v + '%' },
                          grid: { color: (getComputedStyle(document.documentElement).getPropertyValue('--border') + '30') || '#37415130', drawBorder: false },
                          border: { display: false },
                        },
                      },
                      plugins: {
                        legend: {
                          display: true,
                          position: 'top',
                          align: 'end',
                          labels: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--foreground') || '#e5e7eb',
                            usePointStyle: true,
                            boxWidth: 12,
                            boxHeight: 6,
                            padding: 12,
                          },
                        },
                        tooltip: {
                          enabled: true,
                          intersect: false,
                          backgroundColor: 'rgba(17, 24, 39, 0.95)',
                          titleColor: '#f3f4f6',
                          bodyColor: '#f3f4f6',
                          borderColor: getComputedStyle(document.documentElement).getPropertyValue('--border') || '#374151',
                          borderWidth: 1,
                          cornerRadius: 8,
                          padding: 12,
                          callbacks: {
                            title: function(items) {
                              try {
                                const ts = items?.[0]?.parsed?.x ?? items?.[0]?.raw?.x;
                                return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                              } catch {
                                return '';
                              }
                            },
                            label: function(ctx) {
                              return `${ctx.dataset.label}: ${Math.round(ctx.parsed.y)}%`;
                            },
                          },
                        },
                        datalabels: { display: false },
                      },
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 bg-[--sidebar] p-3 rounded-[var(--radius)] border border-[--border] shadow">
              <h3>Top 10 Most In-Demand Products</h3>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {forecast.product_demands && forecast.product_demands.map((item, idx) => (
                  <li key={item.product} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{idx + 1}. {item.product}</span>
                      <span style={{ fontWeight: 600 }}>{item.demand_percentage}%</span>
                    </div>
                    {item.reason && (
                      <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>
                        {item.reason}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-[--sidebar] p-3 rounded-[var(--radius)] border border-[--border] shadow">
              <h3>Suggestions to Meet Demand</h3>
              <SuggestionPanel suggestions={forecast.suggestions || []} />
            </div>
          </div>
        </>
      )}
      {overlayLoading && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="animate-spin" style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} />
        </div>
      )}
    </div>
  );
};

export default DemandForecasting;
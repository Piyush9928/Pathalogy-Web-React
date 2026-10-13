import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Chart from 'chart.js/auto';
import apiClient from '../api/client';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/Loader';

function trendClass(value, invert = false) {
  if (Math.abs(value) < 0.05) return 'flat';
  const good = invert ? value < 0 : value > 0;
  return good ? 'up' : 'down';
}

function trendIcon(value) {
  if (Math.abs(value) < 0.05) return 'bi-dash';
  return value > 0 ? 'bi-arrow-up-short' : 'bi-arrow-down-short';
}

const tooltipStyle = {
  backgroundColor: '#1b2c47',
  padding: 11,
  cornerRadius: 9,
  titleFont: { size: 11, weight: '600' },
  bodyFont: { size: 12, weight: '700' },
  displayColors: false,
};

function KpiCard({ icon, iconTone, trend, invertTrend, value, prefix = '', label, foot, footIcon, criticalPill }) {
  return (
    <div className="kpi-card">
      <div className="kpi-top">
        <span className={`kpi-icon ic-${iconTone}`}><i className={`bi ${icon}`} /></span>
        {trend !== undefined && (
          <span className={`trend-chip ${trendClass(trend, invertTrend)}`}>
            <i className={`bi ${trendIcon(trend)}`} />{Math.abs(trend)}%
          </span>
        )}
        {criticalPill && <span className="status-pill pill-danger is-critical">Action needed</span>}
      </div>
      <div className="kpi-value">{prefix}{value?.toLocaleString?.('en-IN') ?? value}</div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-foot"><i className={`bi ${footIcon}`} /> {foot}</div>
    </div>
  );
}

export default function Dashboard() {
  const { hasPermission } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const revenueRef = useRef(null);
  const testVolumeRef = useRef(null);
  const bookingSourceRef = useRef(null);
  const chartInstances = useRef([]);

  useEffect(() => {
    apiClient
      .get('/dashboard')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load dashboard data.'));
  }, []);

  useEffect(() => {
    if (!data) return;

    chartInstances.current.forEach((c) => c.destroy());
    chartInstances.current = [];

    Chart.defaults.font.family = "Inter, 'Segoe UI', sans-serif";
    Chart.defaults.font.size = 11;
    Chart.defaults.color = '#7b8aa0';

    // Revenue area chart
    if (revenueRef.current) {
      const ctx = revenueRef.current.getContext('2d');
      const fill = ctx.createLinearGradient(0, 0, 0, 260);
      fill.addColorStop(0, 'rgba(92, 214, 197, 0.34)');
      fill.addColorStop(1, 'rgba(92, 214, 197, 0.01)');

      const chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.charts.revenueTrend.labels,
          datasets: [{
            label: 'Revenue',
            data: data.charts.revenueTrend.values,
            borderColor: '#1b2c47',
            backgroundColor: fill,
            borderWidth: 2.5,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#1b2c47',
            pointBorderWidth: 2.5,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          animation: { duration: 900, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: { ...tooltipStyle, callbacks: { label: (c) => '₹' + c.parsed.y.toLocaleString('en-IN') } },
          },
          scales: {
            y: { beginAtZero: true, grid: { color: '#eaf0f1' }, ticks: { callback: (v) => '₹' + v / 1000 + 'k' } },
            x: { grid: { display: false } },
          },
        },
      });
      chartInstances.current.push(chart);
    }

    // Test volume bar chart
    if (testVolumeRef.current) {
      const values = data.charts.topTests.values;
      const peak = Math.max(...values);
      const chart = new Chart(testVolumeRef.current, {
        type: 'bar',
        data: {
          labels: data.charts.topTests.labels,
          datasets: [{
            data: values,
            backgroundColor: values.map((v) => (v === peak ? '#1b2c47' : '#8ee7db')),
            borderRadius: 8,
            maxBarThickness: 40,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 800, easing: 'easeOutQuart' },
          plugins: {
            legend: { display: false },
            tooltip: { ...tooltipStyle, callbacks: { label: (c) => c.parsed.y + ' tests' } },
          },
          scales: { y: { beginAtZero: true, grid: { color: '#eaf0f1' } }, x: { grid: { display: false } } },
        },
      });
      chartInstances.current.push(chart);
    }

    // Booking source doughnut
    if (bookingSourceRef.current) {
      const chart = new Chart(bookingSourceRef.current, {
        type: 'doughnut',
        data: {
          labels: data.charts.bookingSource.labels,
          datasets: [{
            data: data.charts.bookingSource.values,
            backgroundColor: ['#1b2c47', '#8ee7db', '#5cd6c5', '#2e4361', '#b3ece3'],
            borderWidth: 3,
            borderColor: '#fff',
            hoverOffset: 10,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          animation: { duration: 800, easing: 'easeOutQuart' },
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle' } },
            tooltip: { ...tooltipStyle, callbacks: { label: (c) => c.label + ': ' + c.parsed + '%' } },
          },
        },
      });
      chartInstances.current.push(chart);
    }

    return () => {
      chartInstances.current.forEach((c) => c.destroy());
      chartInstances.current = [];
    };
  }, [data]);

  if (error) {
    return (
      <div className="lsp-panel">
        <div className="empty-state">
          <span className="es-ico"><i className="bi bi-exclamation-triangle" /></span>
          <h4>Couldn't load dashboard</h4>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return <Loader />;
  const { kpis, charts, recentActivity, greeting } = data;

  return (
    <>
      <PageHeader
        title={greeting}
        subtitle={`Here is what is happening at the laboratory today, ${new Date(data.today).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}.`}
        actions={
          <>
            {hasPermission('bookings.create') && <Link className="btn btn-outline-secondary" to="/bookings/new"><i className="bi bi-journal-plus" /> New Booking</Link>}
            {hasPermission('patients.create') && <Link className="btn btn-primary" to="/patients/new"><i className="bi bi-person-plus" /> Register Patient</Link>}
          </>
        }
      />

      <div className="kpi-row kpi-row-6">
        <KpiCard icon="bi-people-fill" iconTone="primary" trend={kpis.patientsTrend} value={kpis.patientsToday}
          label="Patients Registered Today" foot="vs. same day last week" footIcon="bi-graph-up-arrow" />
        <KpiCard icon="bi-currency-rupee" iconTone="success" trend={kpis.revenueTrend} value={kpis.revenueToday} prefix="₹"
          label="Revenue Collected Today" foot={`₹${kpis.outstandingAmount.toLocaleString('en-IN')} outstanding`} footIcon="bi-wallet2" />
        <KpiCard icon="bi-hourglass-split" iconTone="warning" trend={kpis.pendingTrend} invertTrend value={kpis.reportsPending}
          label="Reports Awaiting Verification" foot={`avg TAT ${kpis.averageTurnaroundHours} h`} footIcon="bi-clock-history" />
        <KpiCard icon="bi-patch-check-fill" iconTone="teal" trend={kpis.reportsCompletedTrend} value={kpis.reportsCompleted}
          label="Reports Completed" foot={`${kpis.samplesInProcess} samples in process`} footIcon="bi-arrow-repeat" />
        <KpiCard icon="bi-house-heart-fill" iconTone="violet" value={kpis.homeCollectionsToday}
          label="Home Collections" foot="phlebotomists on route" footIcon="bi-geo-alt" />
        <KpiCard icon="bi-exclamation-triangle-fill" iconTone="danger" value={kpis.criticalReports}
          label="Critical Results" foot="notify referring physician" footIcon="bi-shield-exclamation"
          criticalPill={kpis.criticalReports > 0} />
      </div>

      <div className="dash-row">
        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-graph-up-arrow" /></span> Revenue Trend <span className="subtitle" style={{ marginLeft: 'auto' }}>Last 7 days</span></h3>
          <div className="chart-box"><canvas ref={revenueRef} /></div>
        </div>
        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-pie-chart-fill" /></span> Booking Source</h3>
          <div className="chart-box"><canvas ref={bookingSourceRef} /></div>
        </div>
      </div>

      <div className="dash-row">
        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-bar-chart-fill" /></span> Top Tests by Volume <span className="subtitle" style={{ marginLeft: 'auto' }}>This month</span></h3>
          <div className="chart-box"><canvas ref={testVolumeRef} /></div>
        </div>
        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-diagram-3-fill" /></span> Department Workload</h3>
          <ul className="top-list">
            {charts.departmentLoads.map((dept) => (
              <li key={dept.name}>
                <div className="top-row"><span style={{ fontWeight: 600 }}>{dept.name}</span><span className="text-muted">{dept.count} tests</span></div>
                <div className="progress-track">
                  <div className={`progress-fill ${dept.tone === 'teal' ? 'pf-teal' : dept.tone === 'warning' ? 'pf-warning' : ''}`} style={{ width: `${dept.percent}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="dash-row">
        <div className="lsp-panel mb-0">
          <h3><span className="h-ico"><i className="bi bi-activity" /></span> Recent Activity <span className="subtitle" style={{ marginLeft: 'auto' }}>Live feed</span></h3>
          {recentActivity.length ? (
            <ul className="activity-feed">
              {recentActivity.map((item, i) => (
                <li key={i}>
                  <span className={`a-dot a-${item.tone}`}><i className={`bi ${item.icon}`} /></span>
                  <div className="a-text">{item.text}</div>
                  <div className="a-meta">{item.meta}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <span className="es-ico"><i className="bi bi-activity" /></span>
              <h4>No activity yet</h4>
              <p>Bookings and reports will appear here as they happen.</p>
            </div>
          )}
        </div>

        <div className="lsp-panel mb-0" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3><span className="h-ico"><i className="bi bi-lightning-charge-fill" /></span> Quick Actions</h3>
          <div className="quick-grid">
            {hasPermission('patients.create') && <Link className="quick-action" to="/patients/new"><i className="bi bi-person-plus-fill" /><span><span className="qa-title" style={{ display: 'block' }}>Register Patient</span><span className="qa-sub">Generate a new UHID</span></span></Link>}
            {hasPermission('bookings.create') && <Link className="quick-action" to="/bookings/new"><i className="bi bi-journal-plus" /><span><span className="qa-title" style={{ display: 'block' }}>New Booking</span><span className="qa-sub">Select tests &amp; collect</span></span></Link>}
            {hasPermission('reports.view') && <Link className="quick-action" to="/reports"><i className="bi bi-patch-check-fill" /><span><span className="qa-title" style={{ display: 'block' }}>Verify Reports</span><span className="qa-sub">{kpis.reportsPending} in queue</span></span></Link>}
            {hasPermission('billing.create') && <Link className="quick-action" to="/billing/new"><i className="bi bi-receipt-cutoff" /><span><span className="qa-title" style={{ display: 'block' }}>Create Invoice</span><span className="qa-sub">GST &amp; discounts</span></span></Link>}
          </div>
          <div className="amount-summary">
            <div className="amount-row"><span><i className="bi bi-cash-stack" /> Outstanding invoices</span><span style={{ fontWeight: 600 }}>{kpis.outstandingInvoices}</span></div>
            <div className="amount-row total"><span>Balance to collect</span><span className="text-danger">₹{kpis.outstandingAmount.toLocaleString('en-IN')}</span></div>
          </div>
        </div>
      </div>
    </>
  );
}

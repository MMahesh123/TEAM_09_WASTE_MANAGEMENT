
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ClipboardList,
  Leaf,
  MapPin,
  Menu,
  MessageCircle,
  Recycle,
  Route,
  ShieldCheck,
  Truck,
  Users,
  X,
  AlertTriangle,
  Trash2,
  Activity,
  Building2,
  PackageCheck,
} from 'lucide-react'

import heroImage from '../../assets/hero.png'
import problemBackground from '../../assets/problem-bg.jpg'
import workflowBackground from '../../assets/Neon Network Meets Nighttime Sanitation.png'
import previewBackground from '../../assets/Emerald Cybercity Night Panorama.png'
import impactBackground from '../../assets/Teal Tech Skyline at Dusk.png'

import './LandingPage.css'

const problems = [
  {
    icon: Trash2,
    title: 'Overflowing Bins',
    description: 'Delayed or irregular collection schedules.',
  },
  {
    icon: AlertTriangle,
    title: 'Unresolved Complaints',
    description: 'Service requests need clear status updates.',
  },
  {
    icon: Truck,
    title: 'Inefficient Operations',
    description: 'Coordinate collection teams, vehicles and wards.',
  },
  {
    icon: Leaf,
    title: 'Community Well-being',
    description: 'Cleaner surroundings start with organized services.',
  },
]

const features = [
  {
    icon: MessageCircle,
    title: 'Complaint Management',
    description: 'Submit, track and manage waste-related complaints.',
  },
  {
    icon: Truck,
    title: 'Vehicle Management',
    description: 'Organize collection vehicles and their status.',
  },
  {
    icon: MapPin,
    title: 'Ward Management',
    description: 'Organize city wards and collection areas.',
  },
  {
    icon: ClipboardList,
    title: 'Assignment Management',
    description: 'Coordinate collection assignments and staff.',
  },
  {
    icon: Recycle,
    title: 'Collection Logging',
    description: 'Record collection details and completed work.',
  },
  {
    icon: Building2,
    title: 'Disposal Management',
    description: 'Organize disposal sites and capacity information.',
  },
  {
    icon: PackageCheck,
    title: 'Payment Management',
    description: 'Keep payment-related records organized.',
  },
  {
    icon: BarChart3,
    title: 'Reports & Analytics',
    description: 'Review operational summaries and reports.',
  },
  {
    icon: Users,
    title: 'Profile & Access',
    description: 'Manage user profiles and authorized access.',
  },
]

const workflow = [
  {
    icon: MessageCircle,
    number: '01',
    title: 'Report an Issue',
    description: 'Submit a waste-related complaint with its details.',
  },
  {
    icon: Route,
    number: '02',
    title: 'Assign Collection',
    description: 'Coordinate the appropriate staff and vehicle.',
  },
  {
    icon: Truck,
    number: '03',
    title: 'Record Collection',
    description: 'Record collection details in the system.',
  },
  {
    icon: CheckCircle2,
    number: '04',
    title: 'Track Resolution',
    description: 'Review complaint and service status updates.',
  },
]

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="landing-ref-section-label">
      <span aria-hidden="true" />
      {children}
    </p>
  )
}

function DashboardPreview() {
  const sidebarItems = [
    { icon: Activity, label: 'Overview', active: true },
    { icon: MessageCircle, label: 'Complaints' },
    { icon: Truck, label: 'Vehicles' },
    { icon: MapPin, label: 'Wards' },
    { icon: ClipboardList, label: 'Assignments' },
    { icon: Recycle, label: 'Collections' },
    { icon: BarChart3, label: 'Reports' },
  ]

  const metricItems = [
    {
      icon: MessageCircle,
      title: 'Complaints',
      subtitle: 'Request tracking',
      color: 'mint',
    },
    {
      icon: Truck,
      title: 'Vehicles',
      subtitle: 'Fleet records',
      color: 'blue',
    },
    {
      icon: MapPin,
      title: 'Wards',
      subtitle: 'Service areas',
      color: 'purple',
    },
    {
      icon: CheckCircle2,
      title: 'Collections',
      subtitle: 'Work records',
      color: 'orange',
    },
  ]

  const activityItems = [
    { icon: ShieldCheck, title: 'Access control' },
    { icon: ClipboardList, title: 'Collection records' },
    { icon: BarChart3, title: 'Operational reports' },
  ]

  const chartBars = [42, 62, 48, 76, 56, 85, 67, 92, 70, 82, 60, 76]

  return (
    <div
      className="landing-ref-dashboard"
      aria-label="Illustrative WMS dashboard preview"
    >
      <aside className="landing-ref-dashboard-sidebar">
        <div className="landing-ref-dashboard-brand">
          <Leaf size={18} />
          <strong>WMS</strong>
        </div>

        {sidebarItems.map(({ icon: Icon, label, active }) => (
          <div
            className={`landing-ref-dashboard-nav ${active ? 'is-active' : ''}`}
            key={label}
          >
            <Icon size={13} />
            <span>{label}</span>
          </div>
        ))}
      </aside>

      <div className="landing-ref-dashboard-main">
        <div className="landing-ref-dashboard-topbar">
          <span className="landing-ref-dashboard-search">
            ⌕ Search workspace
          </span>

          <span className="landing-ref-dashboard-user">
            <span className="landing-ref-avatar">W</span>
            WMS workspace
          </span>
        </div>

        <div className="landing-ref-dashboard-heading">
          <div>
            <span className="landing-ref-dashboard-kicker">
              WORKSPACE PREVIEW
            </span>
            <h3>Operations Overview</h3>
            <p>A unified view of waste-management workflows.</p>
          </div>

          <span className="landing-ref-dashboard-status">
            <span />
            Preview
          </span>
        </div>

        <div className="landing-ref-dashboard-metrics">
          {metricItems.map(({ icon: Icon, title, subtitle, color }) => (
            <div className="landing-ref-dashboard-metric" key={title}>
              <span className={`landing-ref-dashboard-metric-icon ${color}`}>
                <Icon size={16} />
              </span>
              <strong>{title}</strong>
              <span>{subtitle}</span>
            </div>
          ))}
        </div>

        <div className="landing-ref-dashboard-lower">
          <div className="landing-ref-dashboard-panel">
            <div className="landing-ref-dashboard-panel-title">
              <strong>Service workflow</strong>
              <span>Overview</span>
            </div>

            <div
              className="landing-ref-dashboard-bars"
              aria-hidden="true"
            >
              {chartBars.map((height, index) => (
                <span
                  key={index}
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>

            <div className="landing-ref-dashboard-legend">
              <span>
                <i />
                Workflow visualization
              </span>
            </div>
          </div>

          <div className="landing-ref-dashboard-panel landing-ref-dashboard-activity">
            <div className="landing-ref-dashboard-panel-title">
              <strong>Platform modules</strong>
            </div>

            {activityItems.map(({ icon: Icon, title }) => (
              <div
                className="landing-ref-dashboard-activity-row"
                key={title}
              >
                <Icon size={14} />
                <span>{title}</span>
                <Check size={13} />
              </div>
            ))}
          </div>
        </div>

        <p className="landing-ref-dashboard-disclaimer">
          Illustrative interface preview — not live operational data.
        </p>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  return (
    <main className="landing-ref">
      {/* HERO */}
      <section id="home" className="landing-ref-hero">
        <div className="landing-ref-background" aria-hidden="true">
          <img src={heroImage} alt="" />
        </div>

        <div className="landing-ref-overlay" aria-hidden="true" />

        <header className="landing-ref-header">
          <Link
            to="/"
            className="landing-ref-brand"
            onClick={closeMenu}
            aria-label="WMS home"
          >
            <span className="landing-ref-brand-icon">
              <Leaf size={22} />
            </span>
            <span>WMS</span>
          </Link>

          <button
            className="landing-ref-menu-button"
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            aria-controls="landing-ref-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          <nav
            id="landing-ref-navigation"
            className={`landing-ref-nav ${menuOpen ? 'is-open' : ''}`}
            aria-label="Main navigation"
          >
            <a href="#home" onClick={closeMenu}>Home</a>
            <a href="#features" onClick={closeMenu}>Features</a>
            <a href="#about" onClick={closeMenu}>About</a>
            <Link to="/login" onClick={closeMenu}>Login</Link>
            <Link
              to="/register"
              className="landing-ref-nav-cta"
              onClick={closeMenu}
            >
              Get Started
            </Link>
          </nav>
        </header>

        <div className="landing-ref-content">
          <p className="landing-ref-eyebrow">
            <span className="landing-ref-eyebrow-line" />
            CITY WASTE MANAGEMENT SYSTEM
          </p>

          <h1>
            Cleaner <span>Cities</span>
            <br />
            Greener <span className="landing-ref-tomorrow">Tomorrows</span>
          </h1>

          <p className="landing-ref-description">
            A smart platform for efficient waste collection, monitoring and
            management.
          </p>

          <div className="landing-ref-actions">
            <Link to="/register" className="landing-ref-primary">
              Get Started <ArrowRight size={16} />
            </Link>

            <a href="#features" className="landing-ref-demo">
              <CheckCircle2 size={16} />
              Explore WMS
            </a>
          </div>

          <div className="landing-ref-trust">
            <CheckCircle2 size={15} />
            <span>Connected workflows for cleaner communities</span>
          </div>
        </div>

        <div
          className="landing-ref-stats"
          aria-label="Platform capabilities"
        >
          {[
            { value: '01', label: 'Complaint tracking' },
            { value: '02', label: 'Fleet coordination' },
            { value: '03', label: 'Collection workflows' },
            { value: '04', label: 'Operational reports' },
          ].map((item) => (
            <div className="landing-ref-stat" key={item.label}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <a
          href="#problem"
          className="landing-ref-scroll"
          aria-label="Scroll to learn more"
        >
          <span className="landing-ref-scroll-icon">
            <ArrowDown size={14} />
          </span>
          <span>Scroll</span>
        </a>

        <div className="landing-ref-edge" aria-hidden="true" />
      </section>

      {/* PROBLEM */}
      <section
        id="problem"
        className="landing-ref-problem landing-ref-ray-section"
      >
        <div className="landing-ref-problem-photo" aria-hidden="true">
          <img src={problemBackground} alt="" />
        </div>

        <div className="landing-ref-problem-overlay" aria-hidden="true" />

        <div className="landing-ref-problem-copy">
          <SectionEyebrow>THE PROBLEM</SectionEyebrow>

          <h2>City Waste Challenges Need Better Solutions</h2>

          <p>
            Overflowing bins, missed collections and untracked complaints can
            affect neighbourhoods. WMS brings essential service workflows into
            one organized platform.
          </p>
        </div>

        <div className="landing-ref-problem-grid">
          {problems.map(({ icon: Icon, title, description }, index) => (
            <article className="landing-ref-problem-card" key={title}>
              <span className={`landing-ref-icon-tile tone-${index + 1}`}>
                <Icon size={20} />
              </span>

              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section
        id="features"
        className="landing-ref-features landing-ref-ray-section"
      >
        <div className="landing-ref-feature-copy">
          <SectionEyebrow>KEY FEATURES</SectionEyebrow>

          <h2>One Platform, Multiple Operations</h2>

          <p>
            From citizen complaints to vehicle records and reporting, bring
            key waste-management workflows together in one place.
          </p>

          <Link to="/login" className="landing-ref-text-link">
            Explore the workspace <ArrowRight size={16} />
          </Link>
        </div>

        <div className="landing-ref-feature-grid">
          {features.map(({ icon: Icon, title, description }) => (
            <article className="landing-ref-feature-card" key={title}>
              <span className="landing-ref-feature-icon">
                <Icon size={22} />
              </span>

              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>

              <ArrowRight
                className="landing-ref-feature-arrow"
                size={15}
              />
            </article>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="landing-ref-workflow landing-ref-ray-section">
        <div className="landing-ref-workflow-photo" aria-hidden="true">
          <img src={workflowBackground} alt="" />
        </div>

        <div
          className="landing-ref-workflow-overlay"
          aria-hidden="true"
        />

        <div className="landing-ref-workflow-copy">
          <SectionEyebrow>HOW IT WORKS</SectionEyebrow>

          <h2>From Complaint to Cleaner Streets</h2>

          <p>
            A simple workflow connects service requests with collection
            coordination and status tracking.
          </p>
        </div>

        <div className="landing-ref-workflow-steps">
          {workflow.map(({ icon: Icon, number, title, description }, index) => (
            <article className="landing-ref-step" key={number}>
              <div className="landing-ref-step-top">
                <span className="landing-ref-step-icon">
                  <Icon size={22} />
                </span>

                {index < workflow.length - 1 && (
                  <span
                    className="landing-ref-step-connector"
                    aria-hidden="true"
                  />
                )}
              </div>

              <span className="landing-ref-step-number">{number}</span>

              <h3>{title}</h3>

              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* PRODUCT PREVIEW */}
      <section
        id="about"
        className="landing-ref-product landing-ref-ray-section"
      >
        <div className="landing-ref-product-photo" aria-hidden="true">
          <img src={previewBackground} alt="" />
        </div>

        <div className="landing-ref-product-overlay" aria-hidden="true" />

        <div className="landing-ref-product-copy">
          <SectionEyebrow>PRODUCT PREVIEW</SectionEyebrow>

          <h2>A Modern Workspace for Better Management</h2>

          <p>
            Explore a unified interface for complaints, vehicles, wards,
            collection workflows and operational reporting.
          </p>

          <Link to="/login" className="landing-ref-primary">
            Open Workspace <ArrowRight size={16} />
          </Link>
        </div>

        <DashboardPreview />
      </section>

      {/* IMPACT */}
      <section className="landing-ref-impact">
        <div className="landing-ref-impact-image" aria-hidden="true">
          <img src={impactBackground} alt="" />
        </div>

        <div className="landing-ref-impact-overlay" aria-hidden="true" />

        <div className="landing-ref-impact-copy">
          <SectionEyebrow>OUR IMPACT</SectionEyebrow>

          <h2>
            Clean <span>Communities</span>
            <br />
            Brighter <span>Futures</span>
          </h2>

          <p>
            Better coordination can help communities work toward cleaner,
            healthier and more sustainable public spaces.
          </p>

          <div className="landing-ref-impact-actions">
            <Link to="/register" className="landing-ref-primary">
              Get Started <ArrowRight size={16} />
            </Link>

            <a href="#problem" className="landing-ref-demo">
              Learn More
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="landing-ref-footer">
        <Link to="/" className="landing-ref-brand" aria-label="WMS home">
          <span className="landing-ref-brand-icon">
            <Leaf size={21} />
          </span>
          <span>WMS</span>
        </Link>

        <p>City Waste Management System</p>

        <nav aria-label="Footer navigation">
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#about">About</a>
          <Link to="/login">Login</Link>
        </nav>

        <span className="landing-ref-footer-tagline">
          Cleaner cities. Greener tomorrows.
        </span>
      </footer>
    </main>
  )
}

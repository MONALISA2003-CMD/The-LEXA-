import { Link } from 'react-router';

/** Do not call authenticated employee APIs from a public browser-only sample. */
export default function SampleEmployment() {
  return <div className="page-stack">
    <header className="lexa-browser-demo-heading">
      <span>EMPLOYMENT · FICTIONAL EXAMPLE</span>
      <h1>My employment profile</h1>
      <p>A signed-in employee sees only their own verified employment details here. A public sample cannot identify an employee or display a real payslip.</p>
    </header>
    <section className="section-card" style={{ padding: 24 }}>
      <h2>Explore fictional staff records safely</h2>
      <p>Use Employees and Payroll to view the sample registers. These entries are illustrative, not actual payroll calculations.</p>
      <Link to="/modules/employees">View example employees →</Link>
    </section>
  </div>;
}

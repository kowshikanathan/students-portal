import Link from 'next/link';

export function FinanceIntroduction() {
  return (
    <section className="wrap section">
      <p className="eyebrow">EDUCATION FEE MANAGEMENT</p>
      <h1>One clear view of every student’s fees.</h1>
      <p>
        Manage fee structures, individual Flex schedules and recurring eNACH collections in one
        institution workspace.
      </p>
      <div className="row">
        <Link className="button primary" href="/portal/">
          Student / Parent Login
        </Link>
        <Link className="button outline" href="/admin/">
          Institution Login
        </Link>
      </div>
      <div className="product-cards" style={{ marginTop: '2rem' }}>
        {[
          [
            'fees',
            'Fee Management',
            'Students, scholarships, installments, recorded payments and immutable receipts.',
          ],
          [
            'flex',
            'Flex Schedules',
            'Start with a Master Schedule and customize future installments for each student.',
          ],
          [
            'enach',
            'Flex / eNACH',
            'Register mandates and collect the current remaining installment balance. Sandbox eNACH is available for testing.',
          ],
        ].map(([id, title, description]) => (
          <article className="product-card" id={id} key={id}>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

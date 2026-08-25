import type { Metadata } from "next";
import Link from "next/link";
import { businessConfiguration } from "../../lib/business";

export const metadata: Metadata = {
  title: "Shop policies",
  description: "Shipping, size exchange, privacy and shopping terms for Classy Apparels by Sana.",
};

export default function PoliciesPage() {
  const business = businessConfiguration();
  return (
    <main className="policies-page">
      <header className="product-page-header"><Link href="/">← Home</Link><Link className="checkout-wordmark" href="/"><span>Classy Apparels</span></Link><a href="https://wa.me/917715910151" target="_blank" rel="noreferrer">Questions?</a></header>
      <div className="policies-layout">
        <aside><p className="kicker">Shop with clarity</p><h1>Policies, in plain language.</h1><nav><a href="#shipping">Shipping</a><a href="#exchange">Returns &amp; exchange</a><a href="#privacy">Privacy</a><a href="#terms">Shopping terms</a><a href="#contact">Business contact</a></nav></aside>
        <article>
          <section id="shipping"><span>01</span><h2>Shipping</h2><p>We accept delivery addresses across India. Orders are normally prepared for dispatch within 2–4 working days, and delivery is arranged manually with an available courier. Delivery time can vary by PIN code, courier capacity, holidays and weather. Complimentary shipping applies to eligible prepaid orders shown at checkout.</p><p>International delivery is available by manual quote. Enter the complete country, state or province and postal address at checkout, then confirm the courier charge with Sana before payment. Tracking details are shared after the courier booking is complete.</p></section>
          <section id="exchange"><span>02</span><h2>Returns, refunds &amp; size exchange</h2><p>If the size is not right, message us within 3 calendar days of delivery. The piece must be unworn, unwashed, unused and returned with the original tags and packaging. Approval and replacement depend on the requested size being in stock. Items with signs of wear, fragrance, alteration, damage or missing tags cannot be accepted.</p><p>If you receive a wrong or damaged item, record a clear unboxing video and contact us within 24 hours so we can review it quickly. An approved refund is returned to the original payment method; bank processing time can vary.</p><p><strong>Return shipping:</strong> {business.exchangeReturnShippingPolicy || "This business policy has not been configured yet; checkout remains disabled until it is published."}</p></section>
          <section id="privacy"><span>03</span><h2>Privacy</h2><p>We collect the contact and delivery details needed to process your order, provide support, prevent misuse and meet legal or accounting requirements. Payment credentials are entered into Razorpay’s secure checkout and are not stored by this website. Order data is shared only with service providers needed for payment, delivery and customer communication.</p><p>You can ask us to correct your details or request information about the personal data linked to your order by contacting us on WhatsApp.</p></section>
          <section id="terms"><span>04</span><h2>Shopping terms</h2><p>Product colours can vary slightly between phone cameras, lighting and screen settings. Measurements are provided in inches and should be checked before purchase. An order is confirmed only after successful payment verification and stock confirmation. If an item becomes unavailable after payment, we will contact you and arrange a refund to the original payment method.</p><p>Classy Apparels by Sana may cancel suspicious, duplicate or incorrectly priced orders and will refund any captured payment for a cancelled order.</p></section>
          <section id="contact"><span>05</span><h2>Business, customer care &amp; grievance contact</h2>{business.ready ? <address><strong>{business.legalName}</strong><br />{business.address}<br />Customer care: <a href={`mailto:${business.customerCareEmail}`}>{business.customerCareEmail}</a> · <a href={`tel:${business.customerCarePhone.replace(/\s/g, "")}`}>{business.customerCarePhone}</a><br />Grievance officer: {business.grievanceOfficer}</address> : <p>The verified legal name, business address, grievance officer and return-shipping responsibility must be published here before checkout is enabled.</p>}</section>
          <div className="policy-contact"><p className="kicker">Still unsure?</p><h2>Talk to Sana before you order.</h2><a className="button button-dark" href={`https://wa.me/917715910151?text=${encodeURIComponent("Hi Sana, I have a question about the website policies.")}`} target="_blank" rel="noreferrer">Ask on WhatsApp</a></div>
        </article>
      </div>
    </main>
  );
}

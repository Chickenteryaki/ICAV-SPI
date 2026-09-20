// Add the confirmed SPI mailbox before publishing this branch.
// The SPI LinkedIn profile does not list an email. Do not assume the UAS
// team's mailbox also accepts SPI enquiries.
const contactEmail = '';

function buildContactEmail(recipient, details) {
  const oneLine = value => String(value || '').replace(/[\r\n]+/g, ' ').trim();
  const subject = `ICAV SPI: ${oneLine(details.topic)}`;
  const body = `${String(details.message || '').trim()}\n\nName: ${oneLine(details.name)}\nReply email: ${oneLine(details.email)}`;
  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

if (contactEmail) {
  document.querySelectorAll('[data-contact-email]').forEach(link => {
    link.href = `mailto:${contactEmail}`;
    const label = link.querySelector('[data-email-address]');
    if (label) label.textContent = contactEmail;
    else link.textContent = contactEmail;
    link.hidden = false;
  });
}

const contactForm = document.querySelector('#contact-form');
if (contactForm) {
  const button = contactForm.querySelector('[type="submit"]');
  button.disabled = !contactEmail;
  contactForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!contactEmail || !contactForm.reportValidity()) return;
    const details = Object.fromEntries(new FormData(contactForm));
    if (!details.name.trim() || !details.message.trim()) {
      document.querySelector('#form-status').textContent = 'Please add your name and a message.';
      return;
    }
    window.location.href = buildContactEmail(contactEmail, details);
    document.querySelector('#form-status').textContent = 'Review and send your message in your email app. Your message is still here if you need to copy it.';
  });
}

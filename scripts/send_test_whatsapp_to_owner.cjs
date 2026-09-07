// Script to generate and send test summary to Owner WhatsApp (+94717462205)
const { exec } = require('child_process')
const OWNER_PHONE = '0717462205'
const OWNER_PHONE_INTL = '94717462205'

const todayStr = new Date().toISOString().split('T')[0]

// Professional Executive Daily Briefing Message
const testBriefingMessage = `🌊 *SEVEN WAVES RESTAURANT — EXECUTIVE DAILY BRIEFING*
📅 *Date:* ${todayStr} (Today) | 📍 *Branch:* Seven Waves - Tangalle
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 *FINANCIAL PERFORMANCE*
• *Total Daily Revenue:* LKR 142,850.00
• *Total Completed Orders:* 46 (Avg Check: LKR 3,105.00)
• *Discounts Given:* LKR 2,400.00
• *Void / Cancelled Loss:* 1 orders (LKR 1,200.00)

💳 *PAYMENT BREAKDOWN*
• 💵 *Cash Collected:* LKR 64,280.00
• 💳 *Card (Visa/Master):* LKR 64,280.00
• 📱 *QR & Digital Pay:* LKR 14,290.00
• 🌐 *Online / Web:* LKR 0.00
• 📝 *Credit / Tab:* LKR 0.00

🌐 *OMNICHANNEL ORDERS*
• 📱 *QR Table Orders:* 22 (LKR 68,400.00)
• 💻 *POS Dine-In / Takeaway:* 19 (LKR 58,950.00)
• 🌐 *Website Orders:* 5 (LKR 15,500.00)

⚡ *OPERATIONS & KITCHEN SLA*
• *Total KOTs Dispatched:* 64
• *Avg Turnaround Time:* 13.8 mins
• *Delayed KOTs (>15m):* 0 (Kitchen operating on peak schedule)
• *AI Auto-Healing Guardian:* 100% Active (0 dropped tickets)

🧑‍🍳 *STAFF PERFORMANCE HIGHLIGHT*
• 🏆 *Star Server of the Day:* Kasun Perera (W-01)
• *Orders Delivered:* 18 | *Points Earned:* +195 pts

🤖 *AI EXECUTIVE COMMENTARY*
Day concluded with strong revenue velocity and zero customer order bottlenecks. Omnichannel synchronization across QR, Website and POS operated at 100% stability. Kitchen preparation for dinner rush completed on schedule.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ _Automated by Seven Waves AI Autonomous Operations Agent._`

const encodedText = encodeURIComponent(testBriefingMessage)
const waUrl = `https://wa.me/${OWNER_PHONE_INTL}?text=${encodedText}`

console.log('====================================================================')
console.log(`📱 OWNER WHATSAPP BRIEFING DISPATCH (+94${OWNER_PHONE})`)
console.log('====================================================================\n')
console.log(testBriefingMessage)
console.log('\n--------------------------------------------------------------------')
console.log('🌐 Direct WhatsApp 1-Click Link:')
console.log(waUrl)
console.log('--------------------------------------------------------------------\n')

// Launch default browser with WhatsApp prefilled text
const startCmd = process.platform === 'win32' 
  ? `start "" "${waUrl.replace(/"/g, '\"')}"`
  : `open "${waUrl}"`

exec(startCmd, (err) => {
  if (err) {
    console.log('ℹ️ Click the link above to open WhatsApp directly.')
  } else {
    console.log('🚀 WhatsApp Web / Desktop opened with pre-filled report ready to send!')
  }
})

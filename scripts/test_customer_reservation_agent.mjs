// ═══════════════════════════════════════════════════════════════════════════════
// Test CLI for Customer Reservation & Food Ordering AI Agent
// Seven Waves ERP
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.resolve(__dirname, '../.env') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://clykwuzajtwvwuavmtzs.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

// Import agent logic directly for CLI verification
export class CliCustomerReservationAgent {
  constructor(client) {
    this.client = client
  }

  isMatch(text, words) {
    return words.some(w => text.includes(w))
  }

  async handleCustomerMessage({ senderPhone, senderName, messageText }) {
    const raw = (messageText || '').trim()
    const text = raw.toLowerCase()
    const sender = senderName || 'Valued Guest'
    const phone = senderPhone || ''

    if (
      this.isMatch(text, ['table', 'book', 'reserve', 'reservation', 'seat', 'booking', 'resever', 'dinning']) ||
      this.isMatch(text, ['table ekak', 'book karanna', 'reserve karanna', 'heta raata', 'ada raata'])
    ) {
      return await this.handleTableReservation(raw, text, sender, phone)
    }

    if (
      this.isMatch(text, ['menu', 'food', 'dish', 'dishes', 'pizza', 'burger', 'rice', 'kottu', 'dessert', 'coffee', 'price', 'seafood']) ||
      this.isMatch(text, ['kema', 'kanna', 'menu eka', 'ganan'])
    ) {
      return await this.handleMenuInquiry(raw, text)
    }

    if (
      this.isMatch(text, ['open', 'hours', 'time', 'timing', 'close', 'where', 'location', 'address', 'map', 'directions', 'contact', 'wifi']) ||
      this.isMatch(text, ['arapu welawa', 'thiyenne koheda'])
    ) {
      return this.handleRestaurantInfo()
    }

    return {
      replyText: `👋 Hello ${sender}! Welcome to *Seven Waves Restaurant*! 🌊🍽️\n\nHow can we delight you today?\n• 📅 *Table Reservations*\n• 📋 *Food Menu & Specials*\n• ⏰ *Opening Hours & Location*`,
      intent: 'GENERAL'
    }
  }

  async handleTableReservation(raw, text, sender, phone) {
    let guests = 2
    const guestMatch = text.match(/(\d+)\s*(people|person|persons|guests|guest|pax|denek|kattiyak)?/i)
    if (guestMatch && Number(guestMatch[1]) > 0 && Number(guestMatch[1]) < 100) {
      guests = parseInt(guestMatch[1], 10)
    }

    let resDate = new Date().toISOString().slice(0, 10)
    if (text.includes('tomorrow') || text.includes('heta')) {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      resDate = d.toISOString().slice(0, 10)
    }

    let resTime = '19:30'
    const timeMatch = text.match(/(\d{1,2})(:(\d{2}))?\s*(am|pm)/i)
    if (timeMatch) {
      let hr = parseInt(timeMatch[1], 10)
      const min = timeMatch[3] || '00'
      const isPm = timeMatch[4].toLowerCase() === 'pm'
      if (isPm && hr < 12) hr += 12
      if (!isPm && hr === 12) hr = 0
      resTime = `${String(hr).padStart(2, '0')}:${min}`
    }

    let occasion = 'Casual Dining'
    if (text.includes('birthday') || text.includes('upandinaya')) occasion = 'Birthday Celebration'
    else if (text.includes('anniversary')) occasion = 'Anniversary'

    const record = {
      name: sender || 'WhatsApp Guest',
      phone: phone || 'N/A',
      email: '',
      guests,
      reservation_date: resDate,
      reservation_time: resTime,
      occasion,
      message: `[AI-WhatsApp-Agent] Booking request: "${raw}"`,
      status: 'pending'
    }

    const { data: inserted, error } = await this.client
      .from('website_reservations')
      .insert(record)
      .select('id, name, reservation_date, reservation_time, guests, status')
      .single()

    if (error) {
      console.warn('[CliCustomerReservationAgent] DB Insert warning:', error.message)
    }

    const replyText = `🎉 *Table Reservation Request Received!* 🌊🍽️\n\n` +
      `Dear *${sender}*,\n` +
      `We have received your table booking request at *Seven Waves Restaurant*:\n\n` +
      `• 📅 *Date:* ${resDate}\n` +
      `• ⏰ *Time:* ${resTime}\n` +
      `• 👥 *Guests:* ${guests} Pax\n` +
      `• 🎈 *Occasion:* ${occasion}\n` +
      `• 📋 *Status:* Pending Host Confirmation ⏳\n\n` +
      `Our front desk team has been notified on the ERP reservations console. We look forward to welcoming you!\n\n` +
      `_Need to change details? Simply reply here anytime._`

    return {
      replyText,
      intent: 'RESERVATION_CREATED',
      reservationCreated: !error && !!inserted,
      reservationId: inserted?.id
    }
  }

  async handleMenuInquiry(raw, text) {
    let keyword = ''
    let query = this.client
      .from('menu_items')
      .select('name, base_price, is_available')
      .is('deleted_at', null)
      .eq('is_available', true)
      .limit(6)

    if (text.includes('pizza')) {
      query = query.ilike('name', '%pizza%')
      keyword = 'pizza'
    } else if (text.includes('burger')) {
      query = query.ilike('name', '%burger%')
      keyword = 'burger'
    } else if (text.includes('kottu') || text.includes('koththu')) {
      query = query.or('name.ilike.%kottu%,name.ilike.%koththu%')
      keyword = 'kottu'
    } else if (text.includes('rice')) {
      query = query.ilike('name', '%rice%')
      keyword = 'rice'
    } else if (text.includes('seafood') || text.includes('prawn') || text.includes('fish') || text.includes('crab')) {
      query = query.or('name.ilike.%seafood%,name.ilike.%prawn%,name.ilike.%fish%,name.ilike.%crab%')
      keyword = 'seafood'
    } else if (text.includes('pasta') || text.includes('spaghetti')) {
      query = query.or('name.ilike.%pasta%,name.ilike.%spaghetti%')
      keyword = 'pasta'
    } else if (text.includes('coffee') || text.includes('tea') || text.includes('juice') || text.includes('drink')) {
      query = query.or('name.ilike.%coffee%,name.ilike.%tea%,name.ilike.%juice%')
      keyword = 'beverages'
    } else if (text.includes('dessert') || text.includes('cake') || text.includes('ice cream')) {
      query = query.or('name.ilike.%dessert%,name.ilike.%cake%,name.ilike.%ice cream%')
      keyword = 'desserts'
    }

    const { data: dishes, error: menuErr } = await query
    if (menuErr) {
      console.warn('[CliCustomerReservationAgent] Menu query warning:', menuErr.message)
    }

    let replyText = `🍽️ *Seven Waves Restaurant Menu & Highlights* 🌊\n\n`
    if (dishes && dishes.length > 0) {
      replyText += `Here are our popular selections${keyword ? ' for *' + keyword.toUpperCase() + '*' : ''}:\n\n`
      for (const d of dishes) {
        const price = Number(d.base_price || 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        replyText += `• *${d.name}* — LKR ${price}\n`
      }
      replyText += `\n_Fresh ingredients prepared daily by our executive culinary team._\n`
    } else {
      replyText += `We offer an extensive international menu including Gourmet Burgers, Pizzas, and Fresh Seafood!\n`
    }
    replyText += `\nWould you like to reserve a table to dine with us? Just reply: _"Reserve a table for [X] people tonight"_.`

    return { replyText, intent: 'MENU_INFO' }
  }

  handleRestaurantInfo() {
    const replyText = `🌊 *Seven Waves Restaurant (Pvt) Ltd*\n\n` +
      `⏰ *Operating Hours:*\n` +
      `• Monday – Sunday: *11:00 AM – 11:00 PM*\n` +
      `• Lunch Service: 12:00 PM – 3:30 PM\n` +
      `• Dinner & Lounge: 6:30 PM – 11:00 PM\n\n` +
      `📍 *Location:*\n` +
      `Seven Waves Restaurant, Beach Road, Matara, Sri Lanka.\n` +
      `📞 Hotline: +94 71 726 6563\n` +
      `📶 High-Speed Guest Wi-Fi & Parking Available.\n\n` +
      `_Would you like to book a table or view our dining menu?_`

    return { replyText, intent: 'RESTAURANT_INFO' }
  }
}

async function runCliTests() {
  const agent = new CliCustomerReservationAgent(supabase)

  console.log('🤖 Test 1: Customer Table Reservation via WhatsApp')
  console.log('--------------------------------------------------')
  const r1 = await agent.handleCustomerMessage({
    senderPhone: '94771234567',
    senderName: 'Mr. Perera',
    messageText: 'Can I book a table for 4 people tomorrow at 8:00 PM for a birthday celebration?'
  })
  console.log(r1.replyText)
  console.log('Intent:', r1.intent, '| Created in DB:', r1.reservationCreated, '| ResID:', r1.reservationId)

  if (r1.reservationId) {
    const { error: delErr } = await supabase.from('website_reservations').delete().eq('id', r1.reservationId)
    if (!delErr) {
      console.log(`🧹 Cleaned up test reservation record (${r1.reservationId})`)
    }
  }

  console.log('\n🤖 Test 2: Customer Food Menu Inquiry')
  console.log('--------------------------------------------------')
  const r2 = await agent.handleCustomerMessage({
    senderPhone: '94771234567',
    senderName: 'Ms. Silva',
    messageText: 'Could you please show me your pizza menu and prices?'
  })
  console.log(r2.replyText)
  console.log('Intent:', r2.intent)

  console.log('\n🤖 Test 3: Customer Location & Opening Hours')
  console.log('--------------------------------------------------')
  const r3 = await agent.handleCustomerMessage({
    senderPhone: '94771234567',
    senderName: 'Guest',
    messageText: 'Where are you located and what time do you close?'
  })
  console.log(r3.replyText)
  console.log('Intent:', r3.intent)
}

runCliTests().catch(err => {
  console.error('Test error:', err)
  process.exit(1)
})


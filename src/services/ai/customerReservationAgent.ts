// ═══════════════════════════════════════════════════════════════════════════════
// SEVEN WAVES ERP — Customer Reservation & Food Ordering AI Agent
// ═══════════════════════════════════════════════════════════════════════════════
// 1. Handles customer table reservations from WhatsApp and Web chat.
// 2. Automatically extracts date, time, guest count, and occasion.
// 3. Inserts confirmed / pending reservations into `website_reservations`.
// 4. Provides instant real-time Menu queries & pricing from `menu_items`.
// 5. Answers restaurant operating hours, address, and table inquiries 24/7.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase as defaultClient } from 'src/boot/supabase'

export interface CustomerMessageRequest {
  senderPhone: string
  senderName?: string
  messageText: string
}

export interface CustomerMessageResponse {
  replyText: string
  intent: 'RESERVATION_CREATED' | 'RESERVATION_INQUIRY' | 'MENU_INFO' | 'RESTAURANT_INFO' | 'GENERAL'
  reservationCreated?: boolean
  reservationData?: any
}

export class CustomerReservationAgent {
  private client: any

  constructor(customClient?: any) {
    this.client = customClient || defaultClient
  }

  /**
   * Process customer incoming message and reply intelligently.
   */
  async handleCustomerMessage(req: CustomerMessageRequest): Promise<CustomerMessageResponse> {
    const raw = (req.messageText || '').trim()
    const text = raw.toLowerCase()
    const sender = req.senderName || 'Valued Guest'
    const phone = req.senderPhone || ''

    // 1. Table Reservation Intent
    if (
      this.isMatch(text, ['table', 'book', 'reserve', 'reservation', 'seat', 'booking', 'resever', 'place', 'dinning']) ||
      this.isMatch(text, ['table ekak', 'book karanna', 'reserve karanna', 'heta raata', 'ada raata'])
    ) {
      return await this.handleTableReservation(raw, text, sender, phone)
    }

    // 2. Menu & Food Inquiry Intent
    if (
      this.isMatch(text, ['menu', 'food', 'dish', 'dishes', 'pizza', 'burger', 'rice', 'kottu', 'dessert', 'beverage', 'drinks', 'coffee', 'price', 'seafood']) ||
      this.isMatch(text, ['kema', 'kanna', 'menu eka', 'ganan', 'kema monawada'])
    ) {
      return await this.handleMenuInquiry(raw, text)
    }

    // 3. Location, Contact & Opening Hours Intent
    if (
      this.isMatch(text, ['open', 'hours', 'time', 'timing', 'close', 'closing', 'where', 'location', 'address', 'map', 'directions', 'contact', 'wifi']) ||
      this.isMatch(text, ['arapu welawa', 'thiyenne koheda', 'welawe'])
    ) {
      return this.handleRestaurantInfo()
    }

    // 4. Default Hospitality Greeting
    return {
      replyText: `👋 Hello ${sender}! Welcome to *Seven Waves Restaurant*! 🌊🍽️\n\nHow can we delight you today?\n• 📅 *Table Reservations* (e.g. _"Table for 4 tomorrow at 7:30 PM"_)\n• 📋 *Food Menu & Specials* (e.g. _"Show seafood menu"_)\n• ⏰ *Opening Hours & Location*\n\nPlease reply with your inquiry and we'll assist you right away!`,
      intent: 'GENERAL'
    }
  }

  private isMatch(text: string, words: string[]): boolean {
    return words.some(w => text.includes(w))
  }

  // ── 1. Reservation Processing ──────────────────────────────────────────────
  private async handleTableReservation(raw: string, text: string, sender: string, phone: string): Promise<CustomerMessageResponse> {
    // Parse guest count
    let guests = 2
    const guestMatch = text.match(/(\d+)\s*(people|person|persons|guests|guest|pax|denek|denekuta|kattiyak)?/i)
    if (guestMatch && Number(guestMatch[1]) > 0 && Number(guestMatch[1]) < 100) {
      guests = parseInt(guestMatch[1], 10)
    }

    // Parse date
    let resDate = new Date().toISOString().slice(0, 10)
    if (text.includes('tomorrow') || text.includes('heta')) {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      resDate = d.toISOString().slice(0, 10)
    } else {
      const explicitDate = text.match(/\b\d{4}-\d{2}-\d{2}\b/)
      if (explicitDate) resDate = explicitDate[0]
    }

    // Parse time
    let resTime = '19:30' // default 7:30 PM dinner
    const timeMatch = text.match(/(\d{1,2})(:(\d{2}))?\s*(am|pm)/i)
    if (timeMatch) {
      let hr = parseInt(timeMatch[1], 10)
      const min = timeMatch[3] || '00'
      const isPm = timeMatch[4].toLowerCase() === 'pm'
      if (isPm && hr < 12) hr += 12
      if (!isPm && hr === 12) hr = 0
      resTime = `${String(hr).padStart(2, '0')}:${min}`
    } else if (text.includes('lunch') || text.includes('dawal')) {
      resTime = '13:00'
    } else if (text.includes('dinner') || text.includes('raata')) {
      resTime = '19:30'
    }

    // Occasion
    let occasion = 'Casual Dining'
    if (text.includes('birthday') || text.includes('upandinaya')) occasion = 'Birthday Celebration'
    else if (text.includes('anniversary')) occasion = 'Anniversary'
    else if (text.includes('business') || text.includes('meeting')) occasion = 'Business Dinner'
    else if (text.includes('family')) occasion = 'Family Gathering'

    // Insert reservation request into `website_reservations`
    const reservationRecord = {
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

    try {
      const { data: inserted, error } = await this.client
        .from('website_reservations')
        .insert(reservationRecord)
        .select('id, name, reservation_date, reservation_time, guests, status')
        .single()

      if (error) {
        console.warn('[CustomerReservationAgent] DB Insert warning:', error.message)
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
        reservationData: inserted || reservationRecord
      }
    } catch (err: any) {
      return {
        replyText: `Thank you ${sender}! We noted your request for ${guests} guests on ${resDate} at ${resTime}. Our host will contact you shortly to confirm!`,
        intent: 'RESERVATION_INQUIRY'
      }
    }
  }

  // ── 2. Menu Inquiry ─────────────────────────────────────────────────────────
  private async handleMenuInquiry(raw: string, text: string): Promise<CustomerMessageResponse> {
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
      console.warn('[CustomerReservationAgent] Menu query warning:', menuErr.message)
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
      replyText += `We offer an extensive international menu including Italian Pizzas, Gourmet Burgers, Fresh Southern Seafood, and Artisan Coffees!\n`
    }

    replyText += `\nWould you like to reserve a table to dine with us? Just reply: _"Reserve a table for [X] people tonight"_.`

    return {
      replyText,
      intent: 'MENU_INFO'
    }
  }

  // ── 3. Restaurant Information ───────────────────────────────────────────────
  private handleRestaurantInfo(): CustomerMessageResponse {
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

    return {
      replyText,
      intent: 'RESTAURANT_INFO'
    }
  }
}

export const customerReservationAgent = new CustomerReservationAgent()


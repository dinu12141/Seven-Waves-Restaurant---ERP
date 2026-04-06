<template>
  <q-page class="q-pa-md bg-grey-1">
    <PageHeader
      title="AI System Auditor"
      subtitle="Analyze your business operations, detect anomalies, and get actionable insights."
      show-back
      back-route="/admin"
    />

    <div class="row q-col-gutter-md q-mt-md">
      <!-- Controls -->
      <div class="col-12 col-md-4">
        <q-card flat bordered class="q-pa-md fill-height" style="border-radius: 12px">
          <q-card-section class="text-center">
            <q-icon name="smart_toy" size="64px" color="primary" class="q-mb-md" />
            <div class="text-h6 text-weight-bold">Gemini AI Engine</div>
            <p class="text-grey-7 q-mt-sm">
              The AI will scan today's sales, human resources, and financial transactions to identify patterns, potential fraud, and optimization opportunities.
            </p>
            
            <q-btn
              color="primary"
              size="lg"
              class="full-width q-mt-md text-weight-bold"
              icon="analytics"
              label="Run Full System Scan"
              @click="runAIScan"
              :loading="loading"
              unelevated
            >
              <template v-slot:loading>
                <q-spinner-cube class="on-left" />
                Analyzing Systems...
              </template>
            </q-btn>
            
            <div v-if="loading" class="q-mt-md text-grey-8 text-caption">
              Fetching data from Sales, Finance, and HR...
              <q-linear-progress indeterminate color="primary" class="q-mt-sm" />
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Results Display -->
      <div class="col-12 col-md-8">
        <q-card flat bordered class="fill-height" style="border-radius: 12px; min-height: 400px;">
          <q-card-section class="bg-primary text-white row items-center">
            <q-icon name="insights" size="sm" class="q-mr-sm" />
            <div class="text-subtitle1 text-weight-bold">Audit Report & Recommendations</div>
          </q-card-section>

          <q-card-section v-if="aiResponse" class="q-pa-md markdown-body" style="font-size: 15px; line-height: 1.6;">
            <!-- Rendering simple markdown via v-html -->
            <div v-html="formattedResponse"></div>
          </q-card-section>

          <q-card-section v-else-if="!loading" class="flex flex-center text-grey-5" style="min-height: 300px">
            <div class="text-center">
              <q-icon name="find_in_page" size="48px" />
              <div class="q-mt-sm">Click "Run Full System Scan" to generate the report.</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useQuasar } from 'quasar'
import PageHeader from 'components/common/PageHeader.vue'
import { supabase } from 'src/boot/supabase'
import { GoogleGenerativeAI } from '@google/generative-ai'

const $q = useQuasar()
const loading = ref(false)
const aiResponse = ref('')

// Basic markdown to HTML parse for the Gemini response
const formattedResponse = computed(() => {
  if (!aiResponse.value) return ''
  let html = aiResponse.value
  
  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  // Headers
  html = html.replace(/### (.*)/g, '<h3 class="text-h6 q-mt-md q-mb-sm text-primary">$1</h3>')
  html = html.replace(/## (.*)/g, '<h2 class="text-h5 q-mt-lg q-mb-md text-primary text-weight-bold">$1</h2>')
  // Lists
  html = html.replace(/\* (.*)/g, '<li style="margin-bottom: 6px;">$1</li>')
  // Wrap li's in ul
  html = html.replace(/<\/li>\n<li/g, '</li><li')
  html = html.replace(/(<li.*<\/li>)/s, '<ul style="padding-left: 20px;">$1</ul>')
  
  // Newlines
  html = html.replace(/\n\n/g, '<br><br>')
  
  return html
})

async function fetchSystemData() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayISO = todayStart.toISOString()

  // 1. Fetch Sales Data
  const { data: orders } = await supabase
    .from('orders')
    .select('id, total_amount, status, order_type')
    .gte('created_at', todayISO)

  let totalSales = 0
  let totalOrderCount = 0
  let voidCount = 0
  let voidValue = 0

  if (orders) {
    orders.forEach(o => {
      if (o.status === 'completed' || o.status === 'paid') {
        totalSales += Number(o.total_amount || 0)
        totalOrderCount++
      } else if (o.status === 'void' || o.status === 'cancelled') {
        voidCount++
        voidValue += Number(o.total_amount || 0)
      }
    })
  }

  // 2. Fetch Employees Data
  const { count: staffCount } = await supabase
    .from('employees')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  // 3. Fetch AP Invoices / Expenses (basic metric for today)
  const { data: expenses } = await supabase
    .from('ap_invoices')
    .select('total_amount, status')
    .gte('created_at', todayISO)

  let totalExpenses = 0
  if (expenses) {
    expenses.forEach(e => {
      totalExpenses += Number(e.total_amount || 0)
    })
  }

  return {
    date: new Date().toLocaleDateString(),
    sales: {
      total_revenue: totalSales,
      completed_orders: totalOrderCount,
      void_orders_count: voidCount,
      void_orders_value: voidValue,
    },
    hr: {
      active_employees: staffCount || 0,
    },
    finance: {
      expenses_today: totalExpenses
    }
  }
}

async function runAIScan() {
  loading.value = true
  aiResponse.value = ''
  
  try {
    // 1. Gather Data
    const data = await fetchSystemData()
    const jsonDataString = JSON.stringify(data, null, 2)
    
    // 2. Prepare AI
    const API_KEY = "AIzaSyCWf5Yk8bhZM_1OgmzLH4jv-ohg0teDaps"
    const genAI = new GoogleGenerativeAI(API_KEY)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })

    // 3. Prompt Engineering
    const prompt = `
You are an expert ERP System Auditor acting as the "AI Insights" engine for "Seven Waves Restaurant ERP".
Your job is to analyze the following daily data snapshot to find anomalies, potential losses (fraud), and operational optimizations.

Here is the data for today (${data.date}):
${jsonDataString}

Please provide an analysis report with these sections:
1. Executive Summary
2. Revenue & Sales Analysis
3. Risk & Anomaly Detection (specifically look at void counts/values compared to sales. High voids could mean cashier fraud or mistakes)
4. HR & Expenses
5. Actionable Recommendations

**Instructions:**
- Use professional yet simple language.
- Provide the report entirely in English.
- Be analytical. If the void value is high, strongly warn the management to check the cashier.
- Format using Markdown (Bold, Lists, Headers).
`

    // 4. Generate Content
    const result = await model.generateContent(prompt)
    const responseText = result.response.text()
    
    aiResponse.value = responseText

    $q.notify({
      type: 'positive',
      message: 'AI Scan Complete!',
      position: 'top-right'
    })
  } catch (error) {
    console.error("AI Error:", error)
    $q.notify({
      type: 'negative',
      message: 'Failed to connect to the AI Engine. Please check internet connection or API Key.',
      position: 'top-right'
    })
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.fill-height {
  height: 100%;
}
.markdown-body {
  color: #333;
}
.markdown-body strong {
  color: #1976D2; /* Primary color */
}
</style>

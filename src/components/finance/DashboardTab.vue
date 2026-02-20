<template>
  <div class="row q-col-gutter-md">
    <!-- Today Revenue -->
    <div class="col-12 col-md-3">
      <StatCard
        title="Today's Revenue"
        value="LKR 845,000.00"
        icon="attach_money"
        color="green"
        trend="+15%"
        trendIcon="trending_up"
        trendColor="green"
      />
    </div>

    <!-- Pending Payments -->
    <div class="col-12 col-md-3">
      <StatCard
        title="Pending Payments"
        value="LKR 160,000.00"
        icon="pending_actions"
        color="orange"
        trend="3 Invoices"
        trendIcon="warning"
        trendColor="orange"
      />
    </div>

    <!-- Refunds Processed -->
    <div class="col-12 col-md-3">
      <StatCard
        title="Refunds (Today)"
        value="LKR 12,500.00"
        icon="replay"
        color="red"
        trend="-2%"
        trendIcon="trending_down"
        trendColor="green"
      />
    </div>

    <!-- Average Order Value -->
    <div class="col-12 col-md-3">
      <StatCard
        title="Avg. Order Value"
        value="LKR 3,450.00"
        icon="receipt_long"
        color="blue"
        trend="+5%"
        trendIcon="trending_up"
        trendColor="green"
      />
    </div>

    <!-- Sales Chart -->
    <div class="col-12 col-md-8">
      <SalesChart />
    </div>

    <!-- Payment Methods Split -->
    <div class="col-12 col-md-4">
      <q-card class="bg-card-dark text-white full-height" flat bordered>
        <q-card-section>
          <div class="text-h6 q-mb-md">Payment Methods</div>
          <div class="q-gutter-y-md">
            <!-- Card -->
            <div>
              <div class="row justify-between q-mb-xs">
                <span>Credit/Debit Card</span>
                <span>65% (LKR 549,250.00)</span>
              </div>
              <q-linear-progress :value="0.65" color="primary" rounded size="10px" />
            </div>

            <!-- Cash -->
            <div>
              <div class="row justify-between q-mb-xs">
                <span>Cash</span>
                <span>25% (LKR 211,250.00)</span>
              </div>
              <q-linear-progress :value="0.25" color="green" rounded size="10px" />
            </div>

            <!-- Online -->
            <div>
              <div class="row justify-between q-mb-xs">
                <span>Online / UPI</span>
                <span>10% (LKR 84,500.00)</span>
              </div>
              <q-linear-progress :value="0.1" color="orange" rounded size="10px" />
            </div>
          </div>
        </q-card-section>

        <q-separator dark />

        <q-card-section class="q-pt-sm">
          <div class="text-caption text-grey">Last updated: Just now</div>
        </q-card-section>
      </q-card>
    </div>
  </div>
</template>

<script setup>
import StatCard from 'components/common/StatCard.vue'
import SalesChart from 'components/finance/SalesChart.vue'
</script>

<style scoped>
.bg-card-dark {
  background: #1e1e1e;
}
</style>

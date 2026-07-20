<template>
  <!-- MenuBookTab v7 -->
  <div class="q-pa-md">
    <div class="row q-col-gutter-lg">
      <!-- Left: Menu Books List -->
      <div class="col-12 col-md-5">
        <q-card
          :class="
            $q.dark.isActive
              ? 'bg-grey-9 text-white border-subtle erp-card'
              : 'bg-white text-black erp-card'
          "
        >
          <q-card-section class="row items-center q-pb-none">
            <div class="text-h6 text-primary">Menu Books</div>
            <q-space />
            <q-btn flat round dense icon="add" color="primary" @click="openCreateBook">
              <q-tooltip>Create Menu Book</q-tooltip>
            </q-btn>
            <q-btn flat round dense icon="refresh" color="grey-5" @click="fetchBooks" />
          </q-card-section>
          <q-card-section class="q-pa-md">
            <q-list dark separator class="book-list">
              <q-item
                v-for="book in menuBooks"
                :key="book.id"
                clickable
                v-ripple
                :active="selectedBookId === book.id"
                active-class="bg-primary-subtle text-primary selected-book"
                @click="selectedBookId = book.id"
              >
                <q-item-section avatar>
                  <q-avatar
                    size="28px"
                    :color="book.is_default ? 'primary' : 'grey-7'"
                    text-color="white"
                    :icon="book.is_default ? 'menu_book' : 'book'"
                  />
                </q-item-section>
                <q-item-section>
                  <q-item-label class="text-weight-bold">
                    {{ book.name }}
                    <q-badge
                      v-if="book.is_default"
                      color="amber"
                      text-color="black"
                      class="q-ml-sm"
                    >
                      Default
                    </q-badge>
                    <q-badge
                      v-if="book.item_count > 0"
                      color="primary"
                      text-color="white"
                      class="q-ml-sm"
                    >
                      {{ book.item_count }} items
                    </q-badge>
                  </q-item-label>
                  <q-item-label caption class="text-grey-5">
                    {{ book.is_active ? 'Active' : 'Inactive' }}
                    <span v-if="book.valid_from"> · From {{ book.valid_from }}</span>
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="row items-center q-gutter-xs">
                    <q-btn
                      flat
                      round
                      dense
                      icon="edit"
                      size="sm"
                      color="grey-3"
                      @click.stop="openEditBook(book)"
                    />
                    <q-btn
                      flat
                      round
                      dense
                      icon="delete"
                      size="sm"
                      color="negative"
                      @click.stop="deleteBook(book)"
                    />
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
            <div v-if="menuBooks.length === 0" class="text-center q-pa-xl">
              <q-icon name="menu_book" size="48px" color="grey-7" class="q-mb-sm" />
              <div class="text-grey-4 text-subtitle2 q-mb-xs">No Menu Books Yet</div>
              <div class="text-grey-6 text-caption q-mb-md">
                Create a menu book first, then add your menu items to it.
              </div>
              <q-btn color="primary" icon="add" label="Create Menu Book" @click="openCreateBook" />
            </div>
          </q-card-section>
        </q-card>
      </div>

      <!-- Right: Book Items Management -->
      <div class="col-12 col-md-7">
        <q-card
          :class="[
            $q.dark.isActive
              ? 'bg-grey-9 text-white border-subtle erp-card'
              : 'bg-white text-black erp-card',
            { 'disabled-overlay': !selectedBookId },
          ]"
        >
          <q-card-section class="row items-center q-pb-none">
            <div class="text-h6 text-secondary">
              Menu Book Items
              <span v-if="selectedBook" class="text-caption text-grey-5 block">
                {{ selectedBook.name }} — {{ filteredBookItems.length }} items{{
                  bookItemSubFilter ? ' in ' + bookItemSubFilter : ''
                }}
              </span>
            </div>
            <q-space />
            <q-btn
              v-if="selectedBookId"
              color="secondary"
              icon="playlist_add"
              label="Add Item"
              dense
              @click="openAddItems"
            >
              <q-tooltip>Add Menu Items to this Book</q-tooltip>
            </q-btn>
          </q-card-section>
          <q-card-section
            v-if="selectedBookId && bookSubCategories.length > 1"
            class="q-pa-md q-pb-none"
          >
            <div class="row items-center q-gutter-sm">
              <q-chip
                clickable
                :color="!bookItemSubFilter ? 'primary' : 'grey-8'"
                :text-color="!bookItemSubFilter ? 'white' : 'grey-3'"
                @click="bookItemSubFilter = null"
                dense
              >
                All ({{ bookItems.length }})
              </q-chip>
              <q-chip
                v-for="sub in bookSubCategories"
                :key="sub.id"
                clickable
                :color="bookItemSubFilter === sub.name ? 'primary' : 'grey-8'"
                :text-color="bookItemSubFilter === sub.name ? 'white' : 'grey-3'"
                @click="bookItemSubFilter = sub.name"
                dense
              >
                {{ sub.name }} ({{ sub.count }})
              </q-chip>
            </div>
          </q-card-section>
          <q-card-section class="q-pa-md">
            <DataTable
              v-if="selectedBookId"
              title=""
              :rows="filteredBookItems"
              :columns="itemColumns"
              :loading="loadingItems"
              dense
              flat
            >
              <template #body-cell-image="props">
                <q-td :props="props">
                  <q-avatar size="32px" rounded bg-color="grey-9">
                    <img
                      v-if="props.row.menu_items?.image_url"
                      :src="props.row.menu_items.image_url"
                      style="object-fit: cover"
                    />
                    <q-icon v-else name="restaurant" color="grey-6" />
                  </q-avatar>
                </q-td>
              </template>
              <template #body-cell-price="props">
                <q-td :props="props">
                  <span class="text-weight-bold">
                    LKR
                    {{
                      Number(
                        props.row.override_price || props.row.menu_items?.base_price || 0,
                      ).toFixed(2)
                    }}
                  </span>
                  <q-badge
                    v-if="props.row.override_price"
                    color="amber-8"
                    text-color="white"
                    class="q-ml-xs"
                    label="Custom"
                  />
                </q-td>
              </template>
              <template #body-cell-available="props">
                <q-td :props="props">
                  <q-toggle
                    :dark="$q.dark.isActive"
                    dense
                    :model-value="props.row.is_available !== false"
                    @update:model-value="toggleItemAvailability(props.row)"
                    color="green"
                  />
                </q-td>
              </template>
              <template #body-cell-actions="props">
                <q-td :props="props" class="q-gutter-xs">
                  <q-btn
                    flat
                    dense
                    round
                    icon="edit"
                    size="sm"
                    color="primary"
                    @click="emit('edit-item', props.row.menu_items?.id)"
                  >
                    <q-tooltip>Edit Base Item</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    dense
                    round
                    icon="attach_money"
                    size="sm"
                    color="amber"
                    @click="editBookItem(props.row)"
                  >
                    <q-tooltip>Override Price</q-tooltip>
                  </q-btn>
                  <q-btn
                    flat
                    dense
                    round
                    icon="remove_circle"
                    size="sm"
                    color="negative"
                    @click="removeBookItem(props.row)"
                  >
                    <q-tooltip>Remove from Book</q-tooltip>
                  </q-btn>
                </q-td>
              </template>
            </DataTable>
            <div v-else class="text-center q-pa-xl text-grey-5 flex flex-center flex-column">
              <q-icon name="menu_book" size="48px" />
              <div class="q-mt-sm">Select a Menu Book to manage its items</div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <!-- Book Create/Edit Dialog -->
    <q-dialog v-model="bookDialog.show" persistent>
      <q-card
        :dark="$q.dark.isActive"
        :class="$q.dark.isActive ? 'bg-grey-9 text-white' : 'bg-white text-black'"
        style="width: 500px; max-width: 90vw"
      >
        <q-card-section class="row items-center q-pb-none">
          <div class="text-h6">{{ bookDialog.isEdit ? 'Edit Menu Book' : 'New Menu Book' }}</div>
          <q-space />
          <q-btn icon="close" flat round dense v-close-popup />
        </q-card-section>

        <q-card-section class="q-pt-md">
          <div class="row q-col-gutter-md q-mb-md items-center">
            <div class="col-8">
              <q-input dark outlined v-model="bookDialog.form.name" label="Book Name *" autofocus />
            </div>
            <div class="col-4 flex flex-center">
              <div
                class="image-upload-area"
                @click="triggerBookAvatarUpload"
                style="cursor: pointer"
              >
                <q-avatar size="60px" rounded bg-color="grey-9" class="shadow-3">
                  <img
                    v-if="bookDialog.form.image_url"
                    :src="bookDialog.form.image_url"
                    style="object-fit: cover"
                  />
                  <q-icon v-else name="add_a_photo" color="grey-6" size="24px" />
                </q-avatar>
                <div class="text-caption text-grey-6 text-center q-mt-xs" style="font-size: 10px">
                  Photo
                </div>
                <input
                  ref="bookAvatarInputRef"
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="uploadBookAvatar"
                />
              </div>
            </div>
          </div>

          <q-input
            :dark="$q.dark.isActive"
            outlined
            v-model="bookDialog.form.description"
            label="Description"
            type="textarea"
            class="q-mb-md"
          />

          <div class="row q-col-gutter-md q-mb-md">
            <div class="col-6">
              <q-input
                :dark="$q.dark.isActive"
                outlined
                v-model="bookDialog.form.valid_from"
                type="date"
                label="Valid From"
              />
            </div>
            <div class="col-6">
              <q-input
                :dark="$q.dark.isActive"
                outlined
                v-model="bookDialog.form.valid_to"
                type="date"
                label="Valid To"
              />
            </div>
          </div>

          <div class="row q-col-gutter-md items-center">
            <div class="col-6">
              <q-input
                :dark="$q.dark.isActive"
                outlined
                v-model.number="bookDialog.form.sort_order"
                type="number"
                label="Sort Order"
              />
            </div>
            <div class="col-6 q-gutter-sm">
              <q-toggle dark color="green" v-model="bookDialog.form.is_active" label="Active" />
              <q-toggle dark color="green" v-model="bookDialog.form.is_default" label="Default" />
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn
            label="Save Book"
            color="primary"
            :loading="bookDialog.loading"
            @click="saveBook"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- ====== ADD ITEMS TO BOOK DIALOG ====== -->
    <q-dialog v-model="addItemsDialog" persistent>
      <q-card
        :dark="$q.dark.isActive"
        :class="$q.dark.isActive ? 'bg-grey-9 text-white' : 'bg-white text-black'"
        style="width: 560px; max-width: 95vw"
      >
        <q-card-section class="row items-center q-pb-none">
          <div>
            <div class="text-h6">
              <q-icon name="playlist_add" class="q-mr-xs" />
              Add Items to Menu Book
            </div>
            <div class="text-caption text-grey-5">
              {{ selectedBook?.name }} · {{ allMenuItems.length }} total menu items
            </div>
          </div>
          <q-space />
          <q-btn icon="close" flat round dense @click="addItemsDialog = false" />
        </q-card-section>

        <q-card-section class="q-pt-sm">
          <!-- Optional Category / Sub Category filters -->
          <div class="row q-col-gutter-sm q-mb-sm">
            <div class="col-6">
              <q-select
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="addFilterCategoryId"
                :options="allCategories.map((c) => ({ label: c.name, value: c.id }))"
                emit-value
                map-options
                clearable
                label="Filter by Category"
                @update:model-value="
                  () => {
                    addFilterSubCategoryId = null
                    addFilterItemIds = []
                  }
                "
              />
            </div>
            <div class="col-6">
              <q-select
                :dark="$q.dark.isActive"
                dense
                outlined
                v-model="addFilterSubCategoryId"
                :options="
                  addFilterCategoryId
                    ? allSubCategories
                        .filter((s) => s.category_id === addFilterCategoryId)
                        .map((s) => ({ label: s.name, value: s.id }))
                    : []
                "
                emit-value
                map-options
                clearable
                :disable="!addFilterCategoryId"
                label="Filter by Sub Category"
                @update:model-value="addFilterItemIds = []"
              />
            </div>
          </div>

          <!-- Item count indicator -->
          <div class="row items-center q-mb-xs">
            <div class="text-caption text-grey-5">Available to add</div>
            <q-space />
            <q-badge
              :color="availableItemsOptions.length > 0 ? 'primary' : 'grey-7'"
              :label="availableItemsOptions.length + ' items'"
            />
          </div>

          <!-- Empty state when no menu items exist -->
          <q-banner
            v-if="allMenuItems.length === 0"
            :dark="$q.dark.isActive"
            dense
            class="bg-grey-9 text-grey-4 rounded-borders q-mb-sm"
          >
            <template v-slot:avatar><q-icon name="info" color="blue-grey" /></template>
            No menu items found. Please add items in the <strong>Menu Items</strong> tab first.
          </q-banner>

          <!-- ITEM SELECTOR -->
          <q-select
            v-else
            :dark="$q.dark.isActive"
            outlined
            multiple
            use-chips
            v-model="addFilterItemIds"
            :options="filteredItemOptions"
            emit-value
            map-options
            use-input
            input-debounce="100"
            label="Search & Select Menu Item(s) *"
            class="q-mb-sm"
            @filter="onFilterItems"
          >
            <template v-slot:before-options>
              <q-item clickable v-ripple @click="selectAllFilteredItems">
                <q-item-section avatar>
                  <q-icon name="done_all" color="primary" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>Select All Filtered</q-item-label>
                </q-item-section>
              </q-item>
              <q-item clickable v-ripple @click="addFilterItemIds = []" v-if="addFilterItemIds.length > 0">
                <q-item-section avatar>
                  <q-icon name="clear_all" color="negative" />
                </q-item-section>
                <q-item-section>
                  <q-item-label>Clear Selection</q-item-label>
                </q-item-section>
              </q-item>
              <q-separator />
            </template>
            <template v-slot:prepend><q-icon name="search" /></template>
            <template v-slot:no-option>
              <q-item>
                <q-item-section class="text-grey">
                  <span v-if="addFilterCategoryId">No more items available in this category</span>
                  <span v-else>All menu items already added to this book</span>
                </q-item-section>
              </q-item>
            </template>
            <template v-slot:option="scope">
              <q-item v-bind="scope.itemProps">
                <q-item-section avatar>
                  <q-avatar size="36px" rounded>
                    <img v-if="scope.opt.img" :src="scope.opt.img" style="object-fit: cover" />
                    <q-icon v-else name="restaurant" color="grey-5" />
                  </q-avatar>
                </q-item-section>
                <q-item-section>
                  <q-item-label>{{ scope.opt.label }}</q-item-label>
                  <q-item-label caption class="text-grey-5">
                    {{ scope.opt.cat }}
                    <span v-if="scope.opt.sub"> · {{ scope.opt.sub }}</span>
                    · LKR {{ Number(scope.opt.price || 0).toFixed(2) }}
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-badge
                    color="primary"
                    :label="'LKR ' + Number(scope.opt.price || 0).toFixed(0)"
                  />
                </q-item-section>
              </q-item>
            </template>
          </q-select>

          <!-- Auto-Fill Preview Card for Single Selection -->
          <transition enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
            <q-card
              v-if="addFilterItemIds.length === 1 && selectedItemToFill"
              :dark="$q.dark.isActive"
              flat
              class="bg-grey-10 q-mt-xs"
              style="border: 1px solid rgba(33, 150, 243, 0.3); border-radius: 8px"
            >
              <q-card-section class="q-pa-md">
                <div class="row items-start q-gutter-md no-wrap">
                  <q-avatar size="72px" rounded class="shadow-3" style="flex-shrink: 0">
                    <img
                      v-if="selectedItemToFill.image_url"
                      :src="selectedItemToFill.image_url"
                      style="object-fit: cover; width: 72px; height: 72px"
                    />
                    <q-icon v-else name="restaurant_menu" color="grey-5" size="36px" />
                  </q-avatar>
                  <div style="flex: 1; min-width: 0">
                    <div
                      class="text-weight-bold text-white text-subtitle1"
                      style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis"
                    >
                      {{ selectedItemToFill.name }}
                    </div>
                    <div class="q-mt-xs q-gutter-xs">
                      <q-badge
                        color="blue-grey-8"
                        text-color="grey-3"
                        :label="selectedItemToFill.categories?.name || 'Uncategorized'"
                      />
                      <q-badge
                        v-if="selectedItemToFill.menu_sub_categories?.name"
                        color="blue-grey-9"
                        text-color="grey-4"
                        :label="selectedItemToFill.menu_sub_categories.name"
                      />
                      <q-badge v-if="selectedItemToFill.is_veg" color="green-9" label="Veg" />
                      <q-badge v-if="selectedItemToFill.is_spicy" color="red-9" label="Spicy" />
                      <q-badge
                        v-if="selectedItemToFill.is_best_seller"
                        color="amber-9"
                        text-color="black"
                        label="Best Seller"
                      />
                    </div>
                    <div class="text-primary text-h6 text-weight-bold q-mt-sm">
                      LKR {{ Number(selectedItemToFill.base_price).toFixed(2) }}
                    </div>
                  </div>
                </div>
              </q-card-section>
              <q-separator dark />
              <q-card-section class="q-pa-md q-pt-sm">
                <q-input
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model.number="overridePrice"
                  type="number"
                  prefix="LKR"
                  label="Book Price Override (optional)"
                  hint="Leave blank to use base price"
                >
                  <template v-slot:append>
                    <q-btn
                      v-if="overridePrice"
                      flat
                      dense
                      size="sm"
                      icon="clear"
                      color="grey"
                      @click="overridePrice = null"
                    />
                  </template>
                </q-input>
              </q-card-section>
            </q-card>
            <!-- Summary Card for Multiple Selection -->
            <q-card
              v-else-if="addFilterItemIds.length > 1"
              :dark="$q.dark.isActive"
              flat
              class="bg-grey-10 q-mt-xs"
              style="border: 1px solid rgba(33, 150, 243, 0.3); border-radius: 8px"
            >
              <q-card-section class="q-pa-md text-center">
                <div class="text-h6 text-primary">{{ addFilterItemIds.length }} Items Selected</div>
                <div class="text-caption text-grey-4">Price override will apply to ALL selected items if provided.</div>
              </q-card-section>
              <q-separator dark />
              <q-card-section class="q-pa-md q-pt-sm">
                <q-input
                  :dark="$q.dark.isActive"
                  outlined
                  dense
                  v-model.number="overridePrice"
                  type="number"
                  prefix="LKR"
                  label="Batch Price Override (optional)"
                  hint="Leave blank to use individual base prices"
                >
                  <template v-slot:append>
                    <q-btn
                      v-if="overridePrice"
                      flat
                      dense
                      size="sm"
                      icon="clear"
                      color="grey"
                      @click="overridePrice = null"
                    />
                  </template>
                </q-input>
              </q-card-section>
            </q-card>
          </transition>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md q-pt-none">
          <q-btn flat label="Done" color="grey-5" @click="addItemsDialog = false" />
          <q-btn
            label="Add to Book"
            icon="playlist_add"
            color="primary"
            :disable="addFilterItemIds.length === 0"
            :loading="addingItem"
            @click="saveNewItemToBook"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <!-- Override Price Dialog -->
    <q-dialog v-model="priceDialog.show" persistent>
      <q-card
        :dark="$q.dark.isActive"
        :class="$q.dark.isActive ? 'bg-grey-9 text-white' : 'bg-white text-black'"
        style="min-width: 350px"
      >
        <q-card-section>
          <div class="text-h6">Override Price</div>
          <div class="text-caption text-grey-5">{{ priceDialog.itemName }}</div>
        </q-card-section>
        <q-card-section>
          <q-input
            :dark="$q.dark.isActive"
            outlined
            v-model.number="priceDialog.price"
            type="number"
            label="Override Price (leave empty for default)"
            prefix="LKR"
            clearable
          />
        </q-card-section>
        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat label="Cancel" color="grey-5" v-close-popup />
          <q-btn color="primary" label="Save" @click="savePriceOverride" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { supabase } from 'boot/supabase'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/auth'
import DataTable from 'components/common/DataTable.vue'

const emit = defineEmits(['edit-item'])


const $q = useQuasar()
const authStore = useAuthStore()

const menuBooks = ref([])
const bookItems = ref([])
const allMenuItems = ref([])
const selectedBookId = ref(null)
const loadingItems = ref(false)

const bookDialog = reactive({
  show: false,
  loading: false,
  isEdit: false,
  form: {
    id: null,
    name: '',
    description: '',
    is_active: true,
    is_default: false,
    valid_from: null,
    valid_to: null,
    sort_order: 0,
    image_url: null,
  },
})

const addFilterCategoryId = ref(null)
const addFilterSubCategoryId = ref(null)
const addFilterItemIds = ref([])
const overridePrice = ref(null)
const addingItem = ref(false)
const itemSearchText = ref('')
const filteredItemOptions = ref([])

const bookAvatarInputRef = ref(null)
const bookAvatarUploading = ref(false)
const addItemsDialog = ref(false)
const allCategories = ref([])
const allSubCategories = ref([])
const allKitchens = ref([])
const kitchenMappings = ref([])

// Price Override
const priceDialog = reactive({
  show: false,
  bookItemId: null,
  itemName: '',
  price: null,
})

const bookItemSubFilter = ref(null)

const itemColumns = [
  {
    name: 'image',
    label: '',
    field: 'image',
    align: 'left',
    sortable: false,
    style: 'width: 40px',
  },
  {
    name: 'item_code',
    label: 'Item ID',
    field: (row) => row.menu_items?.item_code || '',
    align: 'left',
    sortable: true,
  },
  {
    name: 'name',
    label: 'Item Name',
    field: (row) => row.menu_items?.name || '',
    align: 'left',
    sortable: true,
  },
  {
    name: 'sub_category',
    label: 'Sub Category',
    field: (row) => row.menu_items?.menu_sub_categories?.name || '',
    align: 'left',
    sortable: true,
  },
  {
    name: 'category',
    label: 'Category',
    field: (row) => row.menu_items?.categories?.name || '',
    align: 'left',
    sortable: true,
  },
  {
    name: 'kitchen',
    label: 'Kitchen',
    field: (row) => row.menu_items?.kitchens?.name || '',
    align: 'left',
    sortable: true,
  },
  { name: 'price', label: 'Price', field: 'price', align: 'right', sortable: true },
  { name: 'available', label: 'Available', field: 'is_available', align: 'center' },
  { name: 'actions', label: 'Actions', align: 'center' },
]

// Sub-categories present in the current book
const bookSubCategories = computed(() => {
  const map = {}
  for (const bi of bookItems.value) {
    const subName = bi.menu_items?.menu_sub_categories?.name
    const subId = bi.menu_items?.sub_category_id
    if (subName) {
      if (!map[subName]) map[subName] = { id: subId, name: subName, count: 0 }
      map[subName].count++
    }
  }
  return Object.values(map).sort((a, b) => a.name.localeCompare(b.name))
})

// Filtered book items by sub-category
const filteredBookItems = computed(() => {
  if (!bookItemSubFilter.value) return bookItems.value
  return bookItems.value.filter(
    (bi) => bi.menu_items?.menu_sub_categories?.name === bookItemSubFilter.value,
  )
})

const selectedBook = computed(() => menuBooks.value.find((b) => b.id === selectedBookId.value))

const existingItemIds = computed(() => new Set(bookItems.value.map((bi) => bi.menu_item_id)))

// Build the full unfiltered options list (used for count display)
const availableItemsOptions = computed(() => {
  let items = allMenuItems.value.filter((i) => !existingItemIds.value.has(i.id))
  if (addFilterCategoryId.value) {
    items = items.filter((i) => i.category_id === addFilterCategoryId.value)
  }
  if (addFilterSubCategoryId.value) {
    items = items.filter((i) => i.sub_category_id === addFilterSubCategoryId.value)
  }
  return items.map((i) => ({
    label: i.name,
    value: i.id,
    img: i.image_url,
    price: i.base_price,
    cat: i.categories?.name || '',
    sub: i.menu_sub_categories?.name || '',
  }))
})

const selectedItemToFill = computed(() => {
  if (addFilterItemIds.value.length !== 1) return null
  return allMenuItems.value.find((i) => i.id === addFilterItemIds.value[0])
})

// QSelect filter handler — this is the KEY function that populates the dropdown
function onFilterItems(val, update) {
  update(() => {
    const searchTerm = (val || '').toLowerCase()
    if (!searchTerm) {
      filteredItemOptions.value = availableItemsOptions.value
    } else {
      filteredItemOptions.value = availableItemsOptions.value.filter((opt) =>
        opt.label.toLowerCase().includes(searchTerm),
      )
    }
  })
}

function selectAllFilteredItems() {
  addFilterItemIds.value = filteredItemOptions.value.map(opt => opt.value)
}

onMounted(() => {
  fetchBooks()
  fetchAllMenuItems()
  fetchSupportingData()
})

watch(selectedBookId, () => {
  if (selectedBookId.value) fetchBookItems()
  else bookItems.value = []
})

async function fetchBooks() {
  try {
    const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'
    const { data } = await supabase
      .from('menu_books')
      .select('*')
      .eq('company_id', companyId)
      .order('sort_order')

    // Count items per book
    const { data: counts } = await supabase.from('menu_book_items').select('menu_book_id')
    const countMap = {}
    for (const c of counts || []) {
      countMap[c.menu_book_id] = (countMap[c.menu_book_id] || 0) + 1
    }

    menuBooks.value = (data || []).map((b) => ({ ...b, item_count: countMap[b.id] || 0 }))

    if (menuBooks.value.length > 0 && !selectedBookId.value) {
      selectedBookId.value = menuBooks.value[0].id
    }
  } catch (err) {
    console.error(err)
  }
}

async function fetchBookItems() {
  if (!selectedBookId.value) return
  loadingItems.value = true
  try {
    const { data, error } = await supabase
      .from('menu_book_items')
      .select(
        '*, menu_items(id, name, base_price, image_url, item_code, sub_category_id, categories(name), menu_sub_categories(name), kitchens(name))',
      )
      .eq('menu_book_id', selectedBookId.value)
      .order('sort_order')

    if (error) throw error
    bookItems.value = data || []
  } catch (err) {
    console.error(err)
    $q.notify({ type: 'negative', message: 'Failed to load book items' })
  } finally {
    loadingItems.value = false
  }
}

async function fetchAllMenuItems() {
  const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'
  const { data, error } = await supabase
    .from('menu_items')
    .select(
      'id, name, base_price, image_url, category_id, sub_category_id, is_available, is_veg, is_spicy, is_best_seller, categories(name), menu_sub_categories(name)',
    )
    .eq('company_id', companyId)
    .order('name')
  if (error) console.error('[MenuBook] fetchAllMenuItems error:', error)
  allMenuItems.value = data || []
  console.log('[MenuBook] Loaded', allMenuItems.value.length, 'menu items')
}

async function fetchSupportingData() {
  const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'
  const [catRes, subRes, kitRes, mapRes] = await Promise.all([
    supabase.from('categories').select('id, name').eq('company_id', companyId).order('sort_order'),
    supabase.from('menu_sub_categories').select('id, name, category_id').order('sort_order'),
    supabase.from('kitchens').select('id, name').eq('is_active', true).order('name'),
    supabase.from('kitchen_subcategory_map').select('subcategory_id, kitchen_id'),
  ])
  allCategories.value = catRes.data || []
  allSubCategories.value = subRes.data || []
  allKitchens.value = kitRes.data || []
  kitchenMappings.value = mapRes.data || []
}

// Book CRUD
function openCreateBook() {
  bookDialog.isEdit = false
  bookDialog.form = {
    id: null,
    name: '',
    description: '',
    is_active: true,
    is_default: false,
    valid_from: null,
    valid_to: null,
    sort_order: menuBooks.value.length + 1,
    image_url: null,
  }
  bookDialog.show = true
}

async function openEditBook(book) {
  bookDialog.isEdit = true
  bookDialog.form = { ...book }
  bookDialog.show = true
}

function triggerBookAvatarUpload() {
  bookAvatarInputRef.value?.click()
}

async function uploadBookAvatar(event) {
  const file = event.target.files?.[0]
  if (!file) return
  bookAvatarUploading.value = true
  try {
    // Compress to WebP before uploading
    const bitmap = await createImageBitmap(file)
    const MAX_W = 800
    let { width, height } = bitmap
    if (width > MAX_W) { height = Math.round((height * MAX_W) / width); width = MAX_W }
    const canvas = new OffscreenCanvas(width, height)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 })

    const fileName = `book_avatar_${Date.now()}.webp`
    const { error: upErr } = await supabase.storage
      .from('menu-images')
      .upload(fileName, blob, { contentType: 'image/webp', upsert: true })
    if (upErr) throw upErr
    const { data: urlData } = supabase.storage.from('menu-images').getPublicUrl(fileName)
    bookDialog.form.image_url = urlData.publicUrl
    $q.notify({ type: 'positive', message: 'Book image uploaded!', timeout: 800 })
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Image upload failed' })
  } finally {
    bookAvatarUploading.value = false
    if (bookAvatarInputRef.value) bookAvatarInputRef.value.value = ''
  }
}

async function saveBook() {
  if (!bookDialog.form.name) {
    $q.notify({ type: 'negative', message: 'Book name is required' })
    return
  }
  bookDialog.loading = true
  try {
    const companyId = authStore.user?.company_id || '5c7ff29c-418a-461a-9624-3667375c2af4'
    const branchId = authStore.currentBranch?.id

    const payload = {
      company_id: companyId,
      branch_id: branchId,
      name: bookDialog.form.name,
      description: bookDialog.form.description || null,
      is_active: bookDialog.form.is_active,
      is_default: bookDialog.form.is_default,
      valid_from: bookDialog.form.valid_from || null,
      valid_to: bookDialog.form.valid_to || null,
      sort_order: bookDialog.form.sort_order,
      image_url: bookDialog.form.image_url || null,
    }

    // If setting as default, unset other defaults first
    if (payload.is_default && branchId) {
      await supabase
        .from('menu_books')
        .update({ is_default: false })
        .eq('branch_id', branchId)
        .eq('is_default', true)
    }

    if (bookDialog.isEdit) {
      await supabase.from('menu_books').update(payload).eq('id', bookDialog.form.id)
      bookDialog.show = false
      await fetchBooks()
      $q.notify({ type: 'positive', message: 'Menu book updated' })
    } else {
      // CREATE new book
      const { data: newBook, error: insertErr } = await supabase
        .from('menu_books')
        .insert([payload])
        .select()
        .single()
      if (insertErr) throw insertErr

      bookDialog.show = false
      await fetchBooks()

      // Auto-select the newly created book
      selectedBookId.value = newBook.id

      $q.notify({
        type: 'positive',
        message: `"${newBook.name}" created! Now add items to it.`,
        icon: 'check_circle',
        timeout: 2500,
      })

      // Wait for Vue reactivity to settle, then open Add Items dialog
      await nextTick()
      openAddItems()
    }
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Error saving book' })
  } finally {
    bookDialog.loading = false
  }
}

async function deleteBook(book) {
  $q.dialog({
    title: 'Delete Menu Book',
    message: `Delete "${book.name}"? All item assignments will be removed.`,
    cancel: true,
    persistent: true,
    dark: true,
    color: 'negative',
  }).onOk(async () => {
    await supabase.from('menu_books').delete().eq('id', book.id)
    if (selectedBookId.value === book.id) selectedBookId.value = null
    fetchBooks()
    $q.notify({ type: 'positive', message: 'Menu book deleted' })
  })
}

async function openAddItems() {
  addFilterCategoryId.value = null
  addFilterSubCategoryId.value = null
  addFilterItemIds.value = []
  overridePrice.value = null
  itemSearchText.value = ''

  // Pre-load the items BEFORE opening the dialog
  await fetchAllMenuItems()

  // Pre-populate filtered options (all items available)
  filteredItemOptions.value = availableItemsOptions.value

  addItemsDialog.value = true
}

async function saveNewItemToBook() {
  if (addFilterItemIds.value.length === 0) return
  addingItem.value = true

  try {
    const payloads = addFilterItemIds.value.map((itemId, idx) => ({
      menu_book_id: selectedBookId.value,
      menu_item_id: itemId,
      override_price: overridePrice.value || null,
      sort_order: bookItems.value.length + idx + 1,
    }))

    const { error } = await supabase.from('menu_book_items').insert(payloads)
    if (error) throw error

    $q.notify({ type: 'positive', message: `${payloads.length} item(s) added to book`, timeout: 800 })

    // Reset selection to allow adding another item quickly
    addFilterItemIds.value = []
    overridePrice.value = null

    await fetchBookItems()
    fetchBooks() // update count

    // Re-populate filtered options (exclude just-added items)
    await nextTick()
    filteredItemOptions.value = availableItemsOptions.value
  } catch (err) {
    $q.notify({ type: 'negative', message: err.message || 'Error adding items' })
  } finally {
    addingItem.value = false
  }
}

async function removeBookItem(row) {
  $q.dialog({
    title: 'Remove Item',
    message: `Remove "${row.menu_items?.name}" from this menu book?`,
    cancel: true,
    dark: true,
  }).onOk(async () => {
    await supabase.from('menu_book_items').delete().eq('id', row.id)
    fetchBookItems()
    fetchBooks()
  })
}

async function toggleItemAvailability(row) {
  await supabase
    .from('menu_book_items')
    .update({ is_available: !row.is_available })
    .eq('id', row.id)
  fetchBookItems()
}

function editBookItem(row) {
  priceDialog.bookItemId = row.id
  priceDialog.itemName = row.menu_items?.name || ''
  priceDialog.price = row.override_price
  priceDialog.show = true
}

async function savePriceOverride() {
  await supabase
    .from('menu_book_items')
    .update({ override_price: priceDialog.price || null })
    .eq('id', priceDialog.bookItemId)
  priceDialog.show = false
  fetchBookItems()
  $q.notify({ type: 'positive', message: 'Price override saved' })
}

defineExpose({
  columns: itemColumns,
  rows: bookItems,
})
</script>

<style scoped>
.erp-card {
  height: 700px;
  display: flex;
  flex-direction: column;
}
.book-list {
  max-height: 550px;
  overflow-y: auto;
}
.border-subtle {
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.selected-book {
  border-left: 3px solid var(--q-primary);
}
.image-upload-area {
  cursor: pointer;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: opacity 0.2s;
  flex-shrink: 0;
}
.image-upload-area:hover {
  opacity: 0.75;
}
</style>

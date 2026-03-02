/**
 * ERP DataGrid Type System
 * SAP/Oracle-standard column and grid configuration types
 */

/** Column data type — controls rendering and alignment */
export type ColumnType =
  | 'text' // Default left-aligned text
  | 'number' // Right-aligned monospace numeric
  | 'currency' // Right-aligned formatted currency (e.g. LKR 1,234.00)
  | 'date' // Formatted date string (DD/MM/YYYY)
  | 'datetime' // Formatted datetime (DD/MM/YYYY HH:mm)
  | 'status' // StatusChip component
  | 'badge' // Colored badge/chip
  | 'boolean' // Checkbox / Yes-No
  | 'actions' // Row action buttons (right-aligned)

/** A single column definition */
export interface GridColumn {
  /** Internal name / field key */
  name: string

  /** Display label in header */
  label: string

  /** Field path in row object (or function returning the value) */
  field: string | ((row: Record<string, unknown>) => unknown)

  /** Column type — drives rendering logic */
  type?: ColumnType

  /** Column alignment override (default is type-driven) */
  align?: 'left' | 'center' | 'right'

  /** Whether this column is sortable */
  sortable?: boolean

  /** Minimum width in px */
  minWidth?: number

  /** Fixed width in px */
  width?: number

  /** Whether this column is visible by default */
  visible?: boolean

  /** Optional formatter function */
  format?: (val: unknown, row?: Record<string, unknown>) => string

  /** Currency code for currency-type columns */
  currency?: string

  /** Whether column can be hidden by the user */
  hideable?: boolean
}

/** Row action definition */
export interface GridAction {
  /** Unique event name emitted when action triggered */
  event: string

  /** Material icon name (18px standard) */
  icon: string

  /** Tooltip / aria-label */
  label: string

  /** Color of the icon button */
  color?: string

  /** Conditionally show this action */
  show?: (row: Record<string, unknown>) => boolean

  /** Whether action is destructive (shows red) */
  danger?: boolean
}

/** Filter definition for the filter drawer */
export interface GridFilter {
  /** Filter field key */
  field: string

  /** Display label */
  label: string

  /** Filter type */
  type: 'select' | 'date-range' | 'text' | 'multi-select'

  /** Options for select/multi-select filters */
  options?: { label: string; value: unknown }[]
}

/** Pagination state */
export interface GridPagination {
  page: number
  rowsPerPage: number
  rowsNumber?: number
  sortBy?: string
  descending?: boolean
}

/** Export format options */
export type ExportFormat = 'csv' | 'pdf'

/** Props interface for BaseDataGrid component */
export interface BaseDataGridProps {
  columns: GridColumn[]
  rows: Record<string, unknown>[]
  loading?: boolean
  error?: string | null
  pagination?: GridPagination
  actions?: GridAction[]
  filters?: GridFilter[]
  rowKey?: string
  title?: string
  subtitle?: string
  searchPlaceholder?: string
  noDataLabel?: string
  storageKey?: string // For localStorage column visibility persistence
  serverSide?: boolean // Whether pagination is server-side
}

import Papa from 'papaparse'
import type { GuestImportRow } from '../types/guests'

export interface CSVParseResult {
  headers: string[]
  rows: GuestImportRow[]
  errors: string[]
}

export function parseGuestCSV(text: string): CSVParseResult {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  })

  const headers = result.meta.fields || []
  const errors = result.errors.map((e) => `Row ${e.row}: ${e.message}`)

  const rows: GuestImportRow[] = result.data.map((row) => ({
    name: row.name || row.full_name || row.fullname || '',
    group: row.group || row.group_name || row.party || row.table_group || undefined,
    dietary: row.dietary || row.diet || row.dietary_restrictions || row.food || undefined,
    vip: row.vip === 'true' || row.vip === 'yes' || row.vip === '1' || false,
    ...row,
  }))

  return { headers, rows: rows.filter((r) => r.name.trim() !== ''), errors }
}

export function exportGuestsCSV(
  guests: Array<{
    name: string
    group: string
    table: string
    seat: string
    dietary: string
    vip: boolean
  }>
): string {
  return Papa.unparse(guests)
}

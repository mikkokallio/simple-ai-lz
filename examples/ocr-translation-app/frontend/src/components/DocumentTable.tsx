import React, { useState } from 'react'

interface Column {
  key: string
  label: string
  width: number
  sortable?: boolean
  render?: (value: any, row: any) => React.ReactNode
}

interface DocumentTableProps {
  columns: Column[]
  data: any[]
  onRowClick?: (row: any) => void
  onSelectionChange?: (selectedIds: string[]) => void
  selectedIds?: string[]
  emptyMessage?: string
}

export function DocumentTable({ 
  columns, 
  data, 
  onRowClick, 
  onSelectionChange, 
  selectedIds = [],
  emptyMessage = 'No items to display'
}: DocumentTableProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (columnKey: string) => {
    if (sortColumn === columnKey) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(columnKey)
      setSortDirection('asc')
    }
  }

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      onSelectionChange?.(data.map(row => row.documentId || row.id))
    } else {
      onSelectionChange?.([])
    }
  }

  const handleSelectRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const newSelection = selectedIds.includes(id)
      ? selectedIds.filter(selectedId => selectedId !== id)
      : [...selectedIds, id]
    onSelectionChange?.(newSelection)
  }

  const sortedData = [...data].sort((a, b) => {
    if (!sortColumn) return 0
    const aVal = a[sortColumn]
    const bVal = b[sortColumn]
    const modifier = sortDirection === 'asc' ? 1 : -1
    return aVal > bVal ? modifier : aVal < bVal ? -modifier : 0
  })

  return (
    <div style={{
      background: 'white',
      border: '1px solid #e0e0e0',
      borderRadius: '2px',
      overflow: 'hidden'
    }}>
      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
          fontFamily: '"Segoe UI", "Segoe UI Web (West European)", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif'
        }}>
          <thead>
            <tr style={{ 
              background: '#fafafa',
              borderBottom: '1px solid #e0e0e0',
              height: '42px'
            }}>
              {/* Checkbox column */}
              <th style={{
                width: '48px',
                padding: '0 16px',
                textAlign: 'center',
                borderRight: '1px solid #e0e0e0'
              }}>
                <input
                  type="checkbox"
                  checked={data.length > 0 && selectedIds.length === data.length}
                  onChange={handleSelectAll}
                  style={{ 
                    width: '16px', 
                    height: '16px',
                    cursor: 'pointer',
                    accentColor: '#0078d4'
                  }}
                />
              </th>
              
              {/* Data columns */}
              {columns.map((col, idx) => (
                <th
                  key={col.key}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  style={{
                    width: `${col.width}px`,
                    padding: '0 12px',
                    textAlign: 'left',
                    fontWeight: 600,
                    color: '#323130',
                    cursor: col.sortable !== false ? 'pointer' : 'default',
                    userSelect: 'none',
                    borderRight: idx < columns.length - 1 ? '1px solid #e0e0e0' : 'none',
                    position: 'relative'
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px',
                    height: '42px'
                  }}>
                    {col.label}
                    {col.sortable !== false && sortColumn === col.key && (
                      <span style={{ fontSize: '10px', color: '#0078d4' }}>
                        {sortDirection === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  style={{
                    padding: '60px 20px',
                    textAlign: 'center',
                    color: '#605e5c',
                    fontSize: '14px'
                  }}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((row, rowIdx) => {
                const id = row.documentId || row.id
                const isSelected = selectedIds.includes(id)
                
                return (
                  <tr
                    key={id}
                    onClick={() => onRowClick?.(row)}
                    style={{
                      background: isSelected ? '#f3f2f1' : rowIdx % 2 === 0 ? 'white' : '#fafafa',
                      borderBottom: '1px solid #edebe9',
                      height: '42px',
                      cursor: onRowClick ? 'pointer' : 'default',
                      transition: 'background-color 0.1s'
                    }}
                    onMouseEnter={(e) => {
                      if (onRowClick) {
                        e.currentTarget.style.background = '#f3f2f1'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = rowIdx % 2 === 0 ? 'white' : '#fafafa'
                      }
                    }}
                  >
                    {/* Checkbox cell */}
                    <td style={{
                      width: '48px',
                      padding: '0 16px',
                      textAlign: 'center',
                      borderRight: '1px solid #edebe9'
                    }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleSelectRow(id, e as any)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ 
                          width: '16px', 
                          height: '16px',
                          cursor: 'pointer',
                          accentColor: '#0078d4'
                        }}
                      />
                    </td>
                    
                    {/* Data cells */}
                    {columns.map((col, colIdx) => (
                      <td
                        key={col.key}
                        style={{
                          padding: '0 12px',
                          color: '#323130',
                          borderRight: colIdx < columns.length - 1 ? '1px solid #edebe9' : 'none',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {col.render ? col.render(row[col.key], row) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

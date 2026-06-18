"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, Plus, Pencil, Trash2, Save, X, ChevronDown, ChevronRight } from "lucide-react"
import adminApi, { EntityType } from "@/lib/admin-api"
import { ENTITY_CONFIGS, EntityConfig, FieldConfig } from "./entity-configs"

// Mock data generator
function generateMockData(config: EntityConfig): Record<string, unknown>[] {
  const items = []
  for (let i = 1; i <= 5; i++) {
    const item: Record<string, unknown> = { id: i }
    config.fields.forEach(f => {
      if (f.type === 'text') item[f.name] = `${config.title.slice(0, -1)} ${i}`
      else if (f.type === 'number') item[f.name] = f.default || i * 10
      else if (f.type === 'checkbox') item[f.name] = i % 2 === 0
      else if (f.type === 'select' && f.options?.length) item[f.name] = f.options[i % f.options.length].value
      else if (f.type === 'icon') item[f.name] = f.placeholder || 'Star'
    })
    items.push(item)
  }
  return items
}

interface EntityManagerProps {
  section: string
}

export function EntityManager({ section }: EntityManagerProps) {
  const config = ENTITY_CONFIGS[section]
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [editingItem, setEditingItem] = useState<Record<string, unknown> | null>(null)
  const [formData, setFormData] = useState<Record<string, unknown>>({})

  const loadItems = useCallback(async () => {
    if (!config) return
    setLoading(true)
    const res = await adminApi.entity.getAll(config.type)
    if (res.success && res.data) {
      setItems(res.data as Record<string, unknown>[])
    } else {
      setItems(generateMockData(config))
    }
    setLoading(false)
  }, [config])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  if (!config) {
    return <div className="text-muted-foreground">Unknown section: {section}</div>
  }

  const filteredItems = items.filter(item =>
    JSON.stringify(item).toLowerCase().includes(search.toLowerCase())
  )

  const handleNew = () => {
    const defaults: Record<string, unknown> = {}
    config.fields.forEach(f => {
      if (f.default !== undefined) defaults[f.name] = f.default
      else if (f.type === 'checkbox') defaults[f.name] = false
      else if (f.type === 'number') defaults[f.name] = 0
      else defaults[f.name] = ''
    })
    setFormData(defaults)
    setEditingItem({})
  }

  const handleEdit = (item: Record<string, unknown>) => {
    setFormData({ ...item })
    setEditingItem(item)
  }

  const handleSave = async () => {
    const id = editingItem?.id as number | undefined
    const res = await adminApi.entity.save(config.type, formData, id)
    if (res.success) {
      loadItems()
      setEditingItem(null)
    } else {
      alert(res.message || 'Save failed')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this item?')) return
    const res = await adminApi.entity.delete(config.type, id)
    if (res.success) {
      loadItems()
    }
  }

  const renderField = (field: FieldConfig) => {
    const value = formData[field.name]
    const onChange = (v: unknown) => setFormData({ ...formData, [field.name]: v })

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            value={String(value || '')}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm"
          />
        )
      case 'select':
        return (
          <select
            value={String(value || '')}
            onChange={e => onChange(e.target.value)}
            className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm"
          >
            {field.options?.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )
      case 'checkbox':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={e => onChange(e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            <span className="text-sm">{field.label}</span>
          </label>
        )
      case 'json':
        return (
          <textarea
            value={typeof value === 'string' ? value : JSON.stringify(value || {}, null, 2)}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
            rows={3}
            className="w-full px-3 py-2 bg-input border border-border rounded-md text-sm font-mono text-xs"
          />
        )
      case 'number':
        return (
          <Input
            type="number"
            value={Number(value) || 0}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            placeholder={field.placeholder}
          />
        )
      default:
        return (
          <Input
            value={String(value || '')}
            onChange={e => onChange(e.target.value)}
            placeholder={field.placeholder}
          />
        )
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Editing form
  if (editingItem !== null) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {editingItem.id ? `Edit ${config.title.slice(0, -1)}` : `New ${config.title.slice(0, -1)}`}
          </h2>
          <div className="flex gap-2">
            <Button onClick={handleSave}>
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>

        <Card className="celtic-border">
          <CardContent className="p-6">
            <div className="grid md:grid-cols-2 gap-4">
              {config.fields.map(field => (
                <div key={field.name} className={field.type === 'textarea' || field.type === 'json' ? 'md:col-span-2' : ''}>
                  {field.type !== 'checkbox' && (
                    <label className="block text-sm font-medium text-muted-foreground mb-1">
                      {field.label}
                      {field.required && <span className="text-destructive ml-1">*</span>}
                    </label>
                  )}
                  {renderField(field)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // List view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{config.title}</h2>
          <p className="text-sm text-muted-foreground">{items.length} entries</p>
        </div>
        <Button onClick={handleNew}>
          <Plus className="w-4 h-4 mr-2" />
          New {config.title.slice(0, -1)}
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${config.title.toLowerCase()}...`}
          className="pl-10"
        />
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-secondary/50">
            <tr>
              {config.listColumns.map(col => (
                <th key={col} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {col.replace('_', ' ')}
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredItems.map((item) => (
              <tr key={item.id as number} className="hover:bg-secondary/20 transition-colors">
                {config.listColumns.map(col => (
                  <td key={col} className="px-4 py-3 text-sm">
                    {col === 'icon' ? (
                      <span className="text-lg">{String(item[col] || '-')}</span>
                    ) : typeof item[col] === 'boolean' ? (
                      <span className={item[col] ? 'text-green-500' : 'text-muted-foreground'}>
                        {item[col] ? 'Yes' : 'No'}
                      </span>
                    ) : (
                      String(item[col] ?? '-')
                    )}
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(item)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(item.id as number)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

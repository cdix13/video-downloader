import { useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useStartDownload } from '../../hooks/useDownloadQueue'
import { useFetchFormats } from '../../hooks/useFormats'
import { Card, CardHeader } from '../ui/Card'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import { Tabs } from '../ui/Tabs'
import { Select } from '../ui/Select'
import { Checkbox } from '../ui/Checkbox'
import { FormatSelector } from './FormatSelector'
import { isValidUrl } from '../../utils/formatters'
import type { MediaType, ProxyType, Format } from '../../types'

const mediaTabs = [
  { id: 'video', label: 'Video', icon: '🎬' },
  { id: 'audio', label: 'Audio', icon: '🎵' },
]

const proxyOptions = [
  { value: 'none', label: 'No Proxy' },
  { value: 'tor', label: 'Tor (9050)' },
  { value: 'tor-browser', label: 'Tor Browser (9150)' },
  { value: 'custom', label: 'Custom Proxy' },
]

export function DownloadForm() {
  const { downloadForm, setDownloadForm } = useUIStore()
  const startDownload = useStartDownload()
  const fetchFormats = useFetchFormats()
  const [formats, setFormats] = useState<Format[]>([])
  const [showFormats, setShowFormats] = useState(false)

  const handleFetchFormats = async () => {
    if (!isValidUrl(downloadForm.url)) return

    const result = await fetchFormats.mutateAsync()
    if (result) {
      setFormats(result.formats)
      setShowFormats(true)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!isValidUrl(downloadForm.url)) return

    const proxy =
      downloadForm.proxyType === 'tor'
        ? 'socks5://127.0.0.1:9050'
        : downloadForm.proxyType === 'tor-browser'
          ? 'socks5://127.0.0.1:9150'
          : downloadForm.proxyType === 'custom'
            ? downloadForm.customProxy
            : ''

    startDownload.mutate({
      url: downloadForm.url,
      audio_only: downloadForm.type === 'audio',
      use_sponsorblock: downloadForm.useSponsorblock,
      use_impersonate: true,
      proxy,
      format_id: downloadForm.selectedFormat || '',
    })

    setShowFormats(false)
    setFormats([])
  }

  const handleUrlChange = (url: string) => {
    setDownloadForm({ url, selectedFormat: null })
    setShowFormats(false)
    setFormats([])
  }

  const urlIsValid = isValidUrl(downloadForm.url)

  return (
    <Card>
      <CardHeader title="Download" icon="⬇️" />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Input
            type="url"
            placeholder="Paste video URL here..."
            value={downloadForm.url}
            onChange={(e) => handleUrlChange(e.target.value)}
            error={downloadForm.url.length > 0 && !urlIsValid}
          />
          {downloadForm.url.length > 0 && !urlIsValid && (
            <p className="text-xs text-error mt-1">Please enter a valid URL</p>
          )}
        </div>

        <Tabs
          tabs={mediaTabs}
          activeTab={downloadForm.type}
          onChange={(id) => setDownloadForm({ type: id as MediaType })}
        />

        {downloadForm.type === 'video' && (
          <Checkbox
            label="Remove sponsors (SponsorBlock)"
            checked={downloadForm.useSponsorblock}
            onChange={(e) =>
              setDownloadForm({ useSponsorblock: e.target.checked })
            }
          />
        )}

        <div className="space-y-2">
          <label className="text-sm text-text-secondary">Proxy</label>
          <Select
            options={proxyOptions}
            value={downloadForm.proxyType}
            onChange={(e) =>
              setDownloadForm({ proxyType: e.target.value as ProxyType })
            }
          />
        </div>

        {downloadForm.proxyType === 'custom' && (
          <Input
            placeholder="socks5://127.0.0.1:1080"
            value={downloadForm.customProxy}
            onChange={(e) => setDownloadForm({ customProxy: e.target.value })}
          />
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleFetchFormats}
            disabled={!urlIsValid || fetchFormats.isPending}
            isLoading={fetchFormats.isPending}
            className="flex-1"
          >
            {fetchFormats.isPending ? 'Fetching...' : 'Fetch Formats'}
          </Button>
          <Button
            type="submit"
            disabled={!urlIsValid || startDownload.isPending}
            isLoading={startDownload.isPending}
            className="flex-1"
          >
            Start Download
          </Button>
        </div>

        {showFormats && formats.length > 0 && (
          <FormatSelector
            formats={formats}
            selectedFormat={downloadForm.selectedFormat}
            onSelect={(formatId) => setDownloadForm({ selectedFormat: formatId })}
          />
        )}
      </form>
    </Card>
  )
}

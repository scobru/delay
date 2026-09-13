import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '../context/AuthContext'

interface Pin {
  cid: string
  name: string
  pinType: string
  type: 'file' | 'directory'
  timestamp: number
  size?: number
  metadata?: any
}

interface PreviewState {
  cid: string
  name: string
  type: string
  content?: string
  blob?: Blob
  url?: string
  isDirectory?: boolean
  files?: Array<{ name: string; path: string; size?: number; mimetype?: string }>
}

const getMimeFromFilename = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const mimes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    pdf: 'application/pdf',
    txt: 'text/plain',
    json: 'application/json',
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    ts: 'text/plain',
    md: 'text/markdown',
  }
  return mimes[ext] || 'application/octet-stream'
}

function Files() {
  const { isAuthenticated, getAuthHeaders, password: adminToken } = useAuth()
  const [pins, setPins] = useState<Pin[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [dragActive, setDragActive] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')

  // Rename modal state
  const [editingPin, setEditingPin] = useState<{ cid: string; currentName: string } | null>(null)
  const [editNameInput, setEditNameInput] = useState('')
  const [isSavingName, setIsSavingName] = useState(false)

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)
    return () => clearTimeout(handler)
  }, [searchQuery])

  const [filterType, setFilterType] = useState('all')
  const [uploadMode, setUploadMode] = useState<'single' | 'directory'>('single')
  const [encryptUpload, setEncryptUpload] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [fileNameOverride, setFileNameOverride] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dirInputRef = useRef<HTMLInputElement>(null)

  const fetchPins = useCallback(async () => {
    try {
      setLoading(true)
      const [pinsRes, metaRes] = await Promise.all([
        fetch('/api/v1/ipfs/pin/ls', { headers: getAuthHeaders() }),
        fetch('/api/v1/user-uploads/system-hashes-map', { headers: getAuthHeaders() })
      ])
      
      const pinsData = await pinsRes.json()
      let metaData: any = {}
      try {
        metaData = await metaRes.json()
      } catch {
        metaData = {}
      }
      const systemHashes = metaData.systemHashes || {}

      if (pinsData.pins) {
        const mappedPins: Pin[] = Object.entries(pinsData.pins).map(([cid, info]: [string, any]) => {
          const meta = systemHashes[cid] || info.metadata || {}
          const isDirectory = meta.isDirectory === true || info.isDirectory === true
          const displayName = meta.displayName || meta.fileName || meta.originalName || info.Name || 'Unnamed'
          const realSize = meta.fileSize ?? info.Size ?? 0

          return {
            cid,
            name: displayName,
            pinType: info.Type || 'recursive',
            type: isDirectory ? 'directory' : 'file',
            timestamp: meta.timestamp || info.timestamp || Date.now(),
            size: realSize,
            metadata: {
              ...meta,
              contentType: meta.contentType || info.contentType,
              isDirectory
            }
          }
        })
        setPins(mappedPins.sort((a, b) => b.timestamp - a.timestamp))
      }
    } catch (error) {
      console.error('Failed to fetch pins:', error)
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  useEffect(() => {
    if (isAuthenticated) fetchPins()
  }, [isAuthenticated, fetchPins])

  const filteredPins = useMemo(() => {
    return pins.filter(pin => {
      const matchesSearch = pin.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
                           pin.cid.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
      const matchesFilter = filterType === 'all' || pin.type === filterType
      return matchesSearch && matchesFilter
    })
  }, [pins, debouncedSearchQuery, filterType])

  // --- Icon Helper ---
  const getFileIcon = (pin: Pin): string => {
    if (pin.type === 'directory' || pin.metadata?.isDirectory) return '📁'
    const mime = (pin.metadata?.contentType || '').toLowerCase()
    const name = (pin.name || '').toLowerCase()
    if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name)) return '🖼️'
    if (mime.startsWith('video/') || /\.(mp4|webm|mkv|mov|avi)$/i.test(name)) return '🎬'
    if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a)$/i.test(name)) return '🎵'
    if (mime === 'application/pdf' || name.endsWith('.pdf')) return '📕'
    if (mime.startsWith('text/') || /\.(txt|md|json|csv|js|ts|html|css)$/i.test(name)) return '📄'
    if (pin.metadata?.isEncrypted) return '🔒'
    return '📄'
  }

  // --- Encryption ---
  const deriveKey = async (password: string, salt: Uint8Array) => {
    const enc = new TextEncoder()
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits", "deriveKey"]
    )
    return window.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" } as Pbkdf2Params,
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    )
  }

  const encryptData = async (data: ArrayBuffer, password: string) => {
    const salt = window.crypto.getRandomValues(new Uint8Array(16))
    const iv = window.crypto.getRandomValues(new Uint8Array(12))
    const key = await deriveKey(password, salt)
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, key, data
    )
    
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength)
    combined.set(salt, 0)
    combined.set(iv, salt.length)
    combined.set(new Uint8Array(encrypted), salt.length + iv.length)
    return combined
  }

  // --- Upload Handler ---
  const handleUpload = async (
    event?: React.ChangeEvent<HTMLInputElement>,
    droppedFiles?: FileList
  ) => {
    const files = droppedFiles || event?.target.files || (fileInputRef.current?.files)
    if (!files || files.length === 0) return

    setUploading(true)
    setUploadProgress(0)
    setStatusMessage('')

    try {
      const formData = new FormData()
      const token = adminToken || ''
      let uploadFileName = ''
      
      if (uploadMode === 'single') {
        let file = files[0]
        let name = fileNameOverride.trim() || file.name
        // Preserve original extension if custom filename doesn't include one
        if (fileNameOverride.trim() && !fileNameOverride.includes('.') && file.name.includes('.')) {
          const ext = file.name.split('.').pop()
          if (ext) name = `${fileNameOverride.trim()}.${ext}`
        }
        uploadFileName = name
        
        if (encryptUpload) {
          setStatusMessage('Encrypting...')
          const buffer = await file.arrayBuffer()
          if (!token) throw new Error("Authentication required for encryption")
          
          const encryptedBytes = await encryptData(buffer, token)
          const encryptedBlob = new Blob([encryptedBytes], { type: 'application/octet-stream' })
          file = new File([encryptedBlob], name + '.enc', { type: 'application/octet-stream' })
          uploadFileName = name + '.enc'
        }
        
        formData.append('file', file, uploadFileName)
        formData.append('customName', uploadFileName)
        formData.append('fileName', uploadFileName)
        formData.append('isEncrypted', String(encryptUpload))
      } else {
        Array.from(files).forEach(file => {
          // @ts-ignore
          const path = file.webkitRelativePath || file.name
          formData.append('files', file, path)
        })
      }

      const endpoint = uploadMode === 'directory' ? '/api/v1/ipfs/upload-directory' : '/api/v1/ipfs/upload'
      
      const xhr = new XMLHttpRequest()
      xhr.open('POST', endpoint)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress((e.loaded / e.total) * 100)
        }
      }

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const result = JSON.parse(xhr.responseText)
          setStatusMessage(`✅ Upload complete: ${uploadFileName || (uploadMode === 'directory' ? 'Directory' : 'File')}`)
          await saveMetadata(result, files, uploadMode === 'directory', uploadFileName)
          setFileNameOverride('')
          if (fileInputRef.current) fileInputRef.current.value = ''
          if (dirInputRef.current) dirInputRef.current.value = ''
          fetchPins()
        } else {
          setStatusMessage(`❌ Upload failed: ${xhr.statusText}`)
        }
        setUploading(false)
      }

      xhr.onerror = () => {
        setStatusMessage('❌ Network error during upload')
        setUploading(false)
      }

      xhr.send(formData)

    } catch (error: any) {
      console.error(error)
      setStatusMessage(`❌ Error: ${error.message}`)
      setUploading(false)
    }
  }

  const saveMetadata = async (
    result: any,
    files: FileList | File[],
    isDir: boolean,
    customName?: string
  ) => {
    try {
      const hash = result.directoryCid || result.cid || result.hash || result.file?.hash
      const mainFile = files[0]
      const name = customName || fileNameOverride.trim() || mainFile?.name || 'Uploaded File'
      
      const metadata = {
        hash,
        userAddress: 'admin-upload',
        timestamp: Date.now(),
        fileName: isDir ? `Directory (${files.length} files)` : name,
        displayName: isDir ? `Directory (${files.length} files)` : name,
        originalName: isDir ? `Directory (${files.length} files)` : (mainFile?.name || name),
        fileSize: result.totalSize || result.size || result.file?.size || (mainFile ? mainFile.size : 0),
        isEncrypted: encryptUpload && !isDir,
        contentType: isDir ? 'application/directory' : (mainFile?.type || getMimeFromFilename(name)),
        isDirectory: isDir,
        fileCount: files.length,
        files: isDir && result.files ? result.files : undefined
      }

      await fetch('/api/v1/user-uploads/save-system-hash', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata)
      })
    } catch (e) {
      console.error('Failed to save metadata', e)
    }
  }

  // --- Direct Download Action ---
  const handleDownload = async (pin: Pin) => {
    try {
      setStatusMessage(`Downloading ${pin.name}...`)
      const res = await fetch(`/api/v1/ipfs/cat/${pin.cid}?download=true`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Failed to download content')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const downloadFilename = pin.name && pin.name !== 'Unnamed' ? pin.name : `${pin.cid}`
      a.download = downloadFilename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setStatusMessage(`✅ Downloaded: ${downloadFilename}`)
      setTimeout(() => setStatusMessage(''), 3000)
    } catch (e: any) {
      setStatusMessage(`❌ Download error: ${e.message}`)
    }
  }

  // --- Preview Logic ---
  const handlePreview = async (pin: Pin) => {
    try {
      if (pin.type === 'directory' || pin.metadata?.isDirectory) {
        setPreview({
          cid: pin.cid,
          name: pin.name,
          type: 'application/directory',
          isDirectory: true,
          files: pin.metadata?.files || []
        })
        return
      }

      setStatusMessage('Loading preview...')
      const res = await fetch(`/api/v1/ipfs/cat/${pin.cid}`, { headers: getAuthHeaders() })
      if (!res.ok) throw new Error('Failed to fetch content')
      
      const rawBlob = await res.blob()
      let type = res.headers.get('Content-Type') || ''
      if (!type || type === 'application/octet-stream') {
        type = pin.metadata?.contentType || getMimeFromFilename(pin.name)
      }
      
      const blob = new Blob([rawBlob], { type })
      const url = URL.createObjectURL(blob)
      
      setPreview({
        cid: pin.cid,
        name: pin.name,
        type: type,
        blob,
        url,
        isDirectory: false
      })
      setStatusMessage('')
    } catch (e: any) {
      setStatusMessage(`Preview failed: ${e.message}`)
    }
  }

  const closePreview = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url)
    setPreview(null)
  }

  // --- Rename Pin ---
  const openRenameModal = (pin: Pin) => {
    setEditingPin({ cid: pin.cid, currentName: pin.name })
    setEditNameInput(pin.name === 'Unnamed' ? '' : pin.name)
  }

  const handleSaveRename = async () => {
    if (!editingPin || !editNameInput.trim()) return
    setIsSavingName(true)
    try {
      await fetch('/api/v1/user-uploads/save-system-hash', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hash: editingPin.cid,
          fileName: editNameInput.trim(),
          displayName: editNameInput.trim()
        })
      })
      setStatusMessage(`✅ Renamed to ${editNameInput.trim()}`)
      setEditingPin(null)
      fetchPins()
      setTimeout(() => setStatusMessage(''), 3000)
    } catch (e: any) {
      setStatusMessage(`❌ Rename failed: ${e.message}`)
    } finally {
      setIsSavingName(false)
    }
  }

  // --- Actions ---
  const handleRemove = async (cid: string) => {
    if (!confirm('Are you sure you want to remove this pin?')) return
    try {
      await fetch('/api/v1/ipfs/pin/rm', {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid })
      })
      fetchPins()
    } catch (e) {
      console.error(e)
    }
  }

  const handleGarbageCollection = async () => {
    if (!confirm('Run Garbage Collection? This will remove unpinned blocks.')) return
    setStatusMessage('Running GC...')
    try {
      await fetch('/api/v1/ipfs/repo/gc', {
        method: 'POST',
        headers: getAuthHeaders()
      })
      setStatusMessage('✅ GC Completed')
    } catch (e) {
      setStatusMessage('❌ GC Failed')
    }
  }

  const handleRemoveAll = async () => {
    if (!confirm('WARNING: Remove ALL pins? This cannot be undone.')) return
    setStatusMessage('Removing all pins...')
    try {
      for (const pin of pins) {
        await fetch('/api/v1/ipfs/pin/rm', {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ cid: pin.cid })
        })
      }
      setStatusMessage('✅ All pins removed')
      fetchPins()
    } catch (e) {
      setStatusMessage('❌ Failed to remove all')
    }
  }

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B'
    if (bytes < 1024) return bytes + ' B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (!isAuthenticated) return (
    <div className="alert alert-warning glass-card border-warning/20">
      <span className="text-2xl">🔒</span>
      <div className="flex flex-col">
        <span className="font-bold">Authentication Required</span>
        <span className="text-xs opacity-70">Access to File Manager is restricted. Please authenticate in Settings.</span>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-8 max-w-6xl animate-in fade-in duration-500">
      {/* Premium Header */}
      <div className="card gradient-secondary shadow-xl border-0 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
           <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5L4.5 5.5c-.3.3-.5.7-.5 1.1V20c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V6.5L15.5 2z"/><path d="M15 2v5h5"/></svg>
        </div>
        <div className="card-body py-8 flex-row items-center justify-between flex-wrap gap-4 relative z-10">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl shadow-inner">
               🗄️
            </div>
            <div>
              <h2 className="card-title text-2xl font-black tracking-tight mb-0.5">File Manager</h2>
              <p className="text-secondary-content/70 text-sm font-medium">Decentralized Storage & IPFS Pinning</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-sm bg-white/20 border-0 text-white font-bold hover:bg-white/30" onClick={handleGarbageCollection}>
               🧹 CLEAN REPO
            </button>
            <button className="btn btn-sm bg-error/20 border-0 text-white font-bold hover:bg-error/40" onClick={handleRemoveAll}>
               🗑️ PURGE ALL
            </button>
          </div>
        </div>
      </div>

      {/* Modern Upload Section */}
      <div className="glass-card overflow-hidden rounded-3xl">
        <div className="p-8">
          <div className="flex items-center gap-2 mb-6">
             <div className="w-2 h-6 bg-primary rounded-full"></div>
             <h3 className="font-black text-lg uppercase tracking-widest opacity-80">Ingest Data</h3>
          </div>
          
          <div 
            className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-300 ${dragActive ? 'border-primary bg-primary/10 scale-[0.99] shadow-inner' : 'border-base-content/10 bg-base-200/30'}`}
            onDragOver={e => { e.preventDefault(); setDragActive(true) }}
            onDragLeave={() => setDragActive(false)}
            onDrop={e => { 
              e.preventDefault() 
              setDragActive(false) 
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleUpload(undefined, e.dataTransfer.files)
              }
            }}
          >
            {/* Mode Switcher */}
            <div className="flex justify-center mb-8">
               <div className="bg-base-300/50 p-1.5 rounded-2xl flex gap-1 shadow-inner">
                  <button 
                     onClick={() => setUploadMode('single')}
                     className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${uploadMode === 'single' ? 'bg-primary text-primary-content shadow-lg' : 'hover:bg-base-300 opacity-50'}`}
                  >
                     SINGLE FILE
                  </button>
                  <button 
                     onClick={() => setUploadMode('directory')}
                     className={`px-6 py-2 rounded-xl text-xs font-black transition-all ${uploadMode === 'directory' ? 'bg-primary text-primary-content shadow-lg' : 'hover:bg-base-300 opacity-50'}`}
                  >
                     DIRECTORY
                  </button>
               </div>
            </div>
            
            <div className="flex flex-col items-center gap-6">
               <div className="w-20 h-20 rounded-full bg-base-100 shadow-xl flex items-center justify-center text-4xl mb-2 animate-bounce-slow">
                  {uploadMode === 'single' ? '📄' : '📁'}
               </div>
               
               {uploadMode === 'single' && (
                 <div className="flex flex-col gap-4 w-full max-w-md">
                   <input 
                     type="text" 
                     className="input input-bordered bg-base-100/50 border-base-content/10 focus:border-primary w-full text-center font-medium" 
                     placeholder="Customize filename (optional)" 
                     value={fileNameOverride}
                     onChange={e => setFileNameOverride(e.target.value)}
                   />
                   <label className="label cursor-pointer justify-center gap-3 group">
                     <input 
                       type="checkbox" 
                       className="checkbox checkbox-primary checkbox-sm shadow-sm" 
                       checked={encryptUpload} 
                       onChange={e => setEncryptUpload(e.target.checked)} 
                     />
                     <span className="text-xs font-bold opacity-60 group-hover:opacity-100 transition-opacity uppercase tracking-widest">Enable AES-GCM Encryption</span>
                   </label>
                 </div>
               )}
               
               <div className="relative group">
                  {uploadMode === 'single' ? (
                    <input 
                      ref={fileInputRef} 
                      type="file" 
                      className="file-input file-input-bordered file-input-primary w-full max-w-xs shadow-lg rounded-2xl"
                      onChange={e => handleUpload(e)} 
                    />
                  ) : (
                    <input 
                      ref={dirInputRef} 
                      type="file" 
                      className="file-input file-input-bordered file-input-primary w-full max-w-xs shadow-lg rounded-2xl"
                      // @ts-ignore
                      webkitdirectory="" 
                      directory="" 
                      onChange={e => handleUpload(e)} 
                    />
                  )}
                  <div className="text-[10px] uppercase font-black tracking-widest opacity-30 mt-4">
                     Drag & drop files here or click to select
                  </div>
               </div>
            </div>
            
            {uploading && (
              <div className="mt-8 max-w-md mx-auto animate-in fade-in slide-in-from-bottom-2">
                <div className="flex justify-between text-[10px] font-black tracking-widest opacity-60 mb-2 uppercase">
                   <span>Uploading to IPFS...</span>
                   <span>{Math.round(uploadProgress)}%</span>
                </div>
                <progress className="progress progress-primary w-full h-3 shadow-inner" value={uploadProgress} max="100"></progress>
              </div>
            )}
            {statusMessage && (
               <div className={`mt-6 text-xs font-bold px-4 py-2 rounded-full inline-block ${statusMessage.includes('❌') ? 'bg-error/10 text-error' : 'bg-success/10 text-success'}`}>
                  {statusMessage}
               </div>
            )}
          </div>
        </div>
      </div>

      {/* Modern Search & Pins Grid */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4 px-2">
           <div className="flex items-center gap-3">
              <h3 className="font-black text-xl tracking-tight">Active Pins</h3>
              <div className="badge bg-primary/10 text-primary border-0 font-black">{filteredPins.length}</div>
           </div>
           
           <div className="flex gap-3 flex-1 md:flex-none justify-end">
              <div className="relative flex-1 md:w-80">
                 <svg className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                 <input 
                   type="text" 
                   className="input input-bordered bg-base-100/50 border-base-content/10 pl-11 w-full rounded-2xl text-sm" 
                   placeholder="Filter by name or CID..." 
                   value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                 />
              </div>
              <select 
                className="select select-bordered bg-base-100/50 border-base-content/10 rounded-2xl text-sm font-bold" 
                value={filterType} 
                onChange={e => setFilterType(e.target.value)}
              >
                <option value="all">ALL OBJECTS</option>
                <option value="file">FILES ONLY</option>
                <option value="directory">DIRECTORIES ONLY</option>
              </select>
           </div>
        </div>

        {loading ? (
          <div className="glass-card p-20 flex flex-col items-center justify-center rounded-3xl">
            <span className="loading loading-spinner loading-lg text-primary mb-4"></span>
            <span className="text-xs font-black tracking-[0.2em] opacity-30 uppercase">Scanning Repository</span>
          </div>
        ) : filteredPins.length === 0 ? (
          <div className="glass-card p-20 text-center rounded-3xl border-dashed border-2">
            <span className="text-6xl block mb-6 filter grayscale opacity-20">📭</span>
            <h4 className="text-xl font-black opacity-30 uppercase tracking-widest">No objects found</h4>
            <p className="text-sm opacity-20 mt-2 font-medium uppercase tracking-tight">Try a different filter or upload new files</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filteredPins.map(pin => (
              <div key={pin.cid} className="glass-card group hover:border-primary/40 transition-all duration-300 rounded-2xl overflow-hidden flex flex-col">
                <div className="p-6 flex-1">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-base-300/50 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform shadow-inner">
                      {getFileIcon(pin)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-base truncate group-hover:text-primary transition-colors flex-1" title={pin.name}>{pin.name}</h4>
                        <button 
                          onClick={() => openRenameModal(pin)} 
                          className="opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity p-1 text-xs" 
                          title="Rename / Set Name"
                        >
                          ✏️
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                         <span className={`text-[10px] font-black px-1.5 py-0.5 rounded bg-base-300 uppercase tracking-tight ${pin.type === 'directory' ? 'text-secondary' : 'text-primary'}`}>
                           {pin.type === 'directory' ? 'DIRECTORY' : 'FILE'}
                         </span>
                         <span className="text-[10px] font-medium opacity-40 font-mono truncate tracking-tighter">{pin.cid}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6 flex items-center justify-between pt-4 border-t border-base-content/5">
                     <div className="flex flex-col">
                        <span className="text-[10px] font-black opacity-20 uppercase tracking-widest">Size</span>
                        <span className="text-xs font-bold opacity-60">{formatBytes(pin.size || 0)}</span>
                     </div>
                     <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black opacity-20 uppercase tracking-widest">Pinned</span>
                        <span className="text-xs font-bold opacity-60">{new Date(pin.timestamp).toLocaleDateString()}</span>
                     </div>
                  </div>
                </div>
                
                <div className="bg-base-300/30 p-3 flex gap-2 justify-end items-center">
                  <button className="btn btn-ghost btn-xs rounded-lg hover:bg-primary/10 hover:text-primary" onClick={() => handlePreview(pin)} title="Preview Content">
                     <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  <button className="btn btn-ghost btn-xs rounded-lg hover:bg-success/10 hover:text-success" onClick={() => handleDownload(pin)} title="Download File">
                     <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                  </button>
                  <button className="btn btn-ghost btn-xs rounded-lg hover:bg-info/10 hover:text-info" onClick={() => {
                    navigator.clipboard.writeText(pin.cid)
                    setStatusMessage('CID Copied!')
                    setTimeout(() => setStatusMessage(''), 2000)
                  }} title="Copy CID">
                     <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                  </button>
                  <div className="flex-1" />
                  <button className="btn btn-ghost btn-xs rounded-lg text-error hover:bg-error/10" onClick={() => handleRemove(pin.cid)} title="Unpin Object">
                     <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rename Modal */}
      {editingPin && (
        <dialog className="modal modal-open backdrop-blur-sm animate-in fade-in duration-300">
          <div className="modal-box glass-card rounded-3xl p-6 border-white/20 shadow-2xl max-w-md">
            <h3 className="font-black text-lg mb-2">Rename IPFS Object</h3>
            <p className="text-xs opacity-50 font-mono mb-4 truncate">{editingPin.cid}</p>
            <input 
              type="text" 
              className="input input-bordered w-full bg-base-100/50 mb-6" 
              placeholder="Enter new name..." 
              value={editNameInput} 
              onChange={e => setEditNameInput(e.target.value)}
              autoFocus
            />
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingPin(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveRename} disabled={isSavingName || !editNameInput.trim()}>
                {isSavingName ? 'Saving...' : 'Save Name'}
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setEditingPin(null)}>close</button>
          </form>
        </dialog>
      )}

      {/* Modern Preview Modal */}
      {preview && (
        <dialog className="modal modal-open backdrop-blur-sm animate-in fade-in duration-300">
          <div className="modal-box max-w-4xl glass-card rounded-3xl p-0 overflow-hidden border-white/20 shadow-2xl">
            <div className="flex justify-between items-center p-6 bg-base-300/50 border-b border-base-content/5">
              <div className="flex items-center gap-4">
                 <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl">
                   {preview.isDirectory ? '📁' : '🔍'}
                 </div>
                 <div>
                    <h3 className="font-black text-lg truncate leading-none mb-1">{preview.name}</h3>
                    <p className="text-[10px] font-mono opacity-40 leading-none">{preview.cid}</p>
                 </div>
              </div>
              <button className="btn btn-circle btn-sm btn-ghost hover:bg-error/10 hover:text-error" onClick={closePreview}>
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            
            <div className="p-8 flex justify-center bg-base-100/30">
              <div className="max-h-[60vh] w-full overflow-auto rounded-xl shadow-inner bg-base-200/50 p-4">
                {preview.isDirectory ? (
                  <div className="flex flex-col gap-4">
                    <div className="text-sm font-bold opacity-70">
                      Directory contents {preview.files && preview.files.length > 0 ? `(${preview.files.length} files)` : ''}
                    </div>
                    {preview.files && preview.files.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {preview.files.map((file, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-base-100/60 rounded-xl border border-base-content/5 hover:bg-base-100 transition-colors">
                            <div className="flex items-center gap-3 truncate">
                              <span>📄</span>
                              <span className="font-medium text-sm truncate">{file.name || file.path}</span>
                              <span className="text-xs opacity-40">({formatBytes(file.size || 0)})</span>
                            </div>
                            <a 
                              href={`/api/v1/ipfs/cat-directory/${preview.cid}/${encodeURIComponent(file.path || file.name)}?download=true`}
                              download={file.name}
                              className="btn btn-xs btn-ghost hover:bg-primary/10 hover:text-primary"
                            >
                              Download
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-10 opacity-40 text-sm">
                        No direct file list available in metadata. Files can be accessed via IPFS path `/ipfs/${preview.cid}/&lt;filename&gt;`.
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {preview.type.startsWith('image/') && (
                      <img src={preview.url} alt="preview" className="max-w-full max-h-[55vh] mx-auto object-contain rounded-lg shadow-sm" />
                    )}
                    {preview.type.startsWith('video/') && (
                      <video src={preview.url} controls className="max-w-full max-h-[55vh] mx-auto rounded-lg" />
                    )}
                    {preview.type.startsWith('audio/') && (
                      <div className="p-10"><audio src={preview.url} controls className="w-full" /></div>
                    )}
                    {preview.type === 'application/pdf' && (
                      <iframe src={preview.url} title="PDF Preview" className="w-full h-[60vh] rounded-lg" />
                    )}
                    {(preview.type.startsWith('text/') || preview.type.includes('json')) && (
                      <iframe src={preview.url} title="Text Preview" className="w-full h-[60vh] bg-transparent rounded-lg" />
                    )}
                    {!preview.type.match(/image|video|audio|pdf|text|json/) && (
                      <div className="text-center py-20 px-10">
                        <div className="text-6xl mb-6">📦</div>
                        <h4 className="font-black text-xl uppercase tracking-widest opacity-30 mb-2">Binary Object</h4>
                        <p className="text-sm opacity-30 mb-8 max-w-xs mx-auto">This object type cannot be rendered inline in the browser.</p>
                        <a href={preview.url} download={preview.name && preview.name !== 'Unnamed' ? preview.name : preview.cid} className="btn gradient-primary border-0 rounded-2xl px-10 font-black tracking-widest">
                           DOWNLOAD DATA
                        </a>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            
            <div className="p-4 bg-base-300/50 flex items-center justify-between text-[10px] font-black tracking-widest opacity-30 px-8 uppercase">
               <span>Object MIME: {preview.type}</span>
               <span>Shogun IPFS Node v1.3.1</span>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={closePreview}>close</button>
          </form>
        </dialog>
      )}
    </div>
  )
}

export default Files

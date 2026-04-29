// ── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL     = 'https://tsdzrzrsjbetkalgthfx.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzZHpyenJzamJldGthbGd0aGZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0OTQ3MTIsImV4cCI6MjA5MjA3MDcxMn0.b6Q3TYuJS0OomV2Ko_ijyJFJkpQt75__Eo_OdejUxHM'
const GROQ_ENDPOINT = '/api/suggest'

// ── Supabase Init ────────────────────────────────────────────────────────────
const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Auth Helpers ─────────────────────────────────────────────────────────────

function getCurrentUser() {
  const session = db.auth.getSession ? null : null // synchronous access not available; use cached session
  // Session is accessed via the cached value set by onAuthStateChange
  return window._currentUser || null
}

async function requireAuth() {
  const { data: { session } } = await db.auth.getSession()
  if (!session) {
    window.location.href = 'auth.html'
    return null
  }
  window._currentUser = session.user
  return session.user
}

async function signIn(email, password) {
  const { error } = await db.auth.signInWithPassword({ email, password })
  if (error) throw error
  window.location.href = 'index.html'
}

async function signUp(email, password) {
  const { error } = await db.auth.signUp({ email, password })
  if (error) throw error
  // Supabase auto signs in after signup (when email confirmation is disabled)
  window.location.href = 'index.html'
}

async function signOut() {
  await db.auth.signOut()
  window.location.href = 'auth.html'
}

// Redirect to auth.html on sign-out event
db.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') window.location.href = 'auth.html'
})

// ── Utils ────────────────────────────────────────────────────────────────────

function getTodayString() {
  const now = new Date()
  const y   = now.getFullYear()
  const m   = String(now.getMonth() + 1).padStart(2, '0')
  const d   = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDate(dateStr) {
  // dateStr: "YYYY-MM-DD" or Date object
  const d = typeof dateStr === 'string' ? new Date(dateStr + 'T00:00:00') : dateStr
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric'
  })
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function debounce(fn, delay) {
  let timer
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}

let _toastContainer = null

function showToast(message, type = 'info') {
  if (!_toastContainer) {
    _toastContainer = document.createElement('div')
    _toastContainer.className = 'toast-container'
    document.body.appendChild(_toastContainer)
  }
  const t = document.createElement('div')
  t.className = `toast ${type}`
  t.textContent = message
  _toastContainer.appendChild(t)
  setTimeout(() => {
    t.style.transition = 'opacity 0.3s'
    t.style.opacity = '0'
    setTimeout(() => t.remove(), 300)
  }, 2800)
}

// ── Database Helpers ─────────────────────────────────────────────────────────

async function getTodayEntry() {
  const today = getTodayString()
  const { data, error } = await db
    .from('diary_entries')
    .select('*')
    .eq('date', today)
    .maybeSingle()
  if (error) throw error
  return data
}

async function upsertEntry(date, content) {
  const user = window._currentUser
  if (!user) throw new Error('Not authenticated')
  const { data, error } = await db
    .from('diary_entries')
    .upsert({ date, content, user_id: user.id }, { onConflict: 'user_id,date' })
    .select()
    .single()
  if (error) throw error
  return data
}

async function saveAiSuggestion(date, result) {
  const user = window._currentUser
  if (!user) throw new Error('Not authenticated')
  const { error } = await db
    .from('diary_entries')
    .upsert({ date, ai_suggestion: result !== null ? JSON.stringify(result) : null, user_id: user.id }, { onConflict: 'user_id,date' })
  if (error) throw error
}

async function getAllEntries() {
  const { data, error } = await db
    .from('diary_entries')
    .select('id, date, content')
    .order('date', { ascending: false })
  if (error) throw error
  return data || []
}

async function getEntryById(id) {
  const { data, error } = await db
    .from('diary_entries')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

async function getEntriesByMonth(year, month) {
  // month is 1-based
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`
  const { data, error } = await db
    .from('diary_entries')
    .select('id, date, content')
    .gte('date', from)
    .lte('date', to)
  if (error) throw error
  return data || []
}

// ── Todo Helpers ─────────────────────────────────────────────────────────────

async function getTodosForDate(date) {
  const user = window._currentUser
  if (!user) return []
  const { data, error } = await db
    .from('entry_todos')
    .select('*')
    .eq('entry_date', date)
    .eq('user_id', user.id)
    .order('display_order', { ascending: true })
  if (error) throw error
  return data || []
}

async function addTodo(date, taskText) {
  const user = window._currentUser
  if (!user) throw new Error('Not authenticated')
  const { data: existing } = await db
    .from('entry_todos')
    .select('display_order')
    .eq('entry_date', date)
    .eq('user_id', user.id)
    .order('display_order', { ascending: false })
    .limit(1)
  const displayOrder = existing?.length ? existing[0].display_order + 1 : 0
  const { data, error } = await db
    .from('entry_todos')
    .insert({ entry_date: date, task: taskText, user_id: user.id, display_order: displayOrder })
    .select()
    .single()
  if (error) throw error
  return data
}

async function toggleTodo(todoId, completed) {
  const { error } = await db
    .from('entry_todos')
    .update({ completed, updated_at: new Date().toISOString() })
    .eq('id', todoId)
  if (error) throw error
}

async function deleteTodo(todoId) {
  const { error } = await db
    .from('entry_todos')
    .delete()
    .eq('id', todoId)
  if (error) throw error
}

async function updateTodo(todoId, task) {
  const { error } = await db
    .from('entry_todos')
    .update({ task, updated_at: new Date().toISOString() })
    .eq('id', todoId)
  if (error) throw error
}

// ── Todo Section UI ──────────────────────────────────────────────────────────

async function initTodoSection(sectionEl, date) {
  if (!sectionEl) return

  let todos = []
  try { todos = await getTodosForDate(date) } catch (_) {}

  const isToday = date === getTodayString()
  const title = isToday ? "Today's Tasks" : `Tasks for ${formatDateShort(date)}`

  function render() {
    const pending   = todos.filter(t => !t.completed)
    const completed = todos.filter(t =>  t.completed)
    const hasTodos  = todos.length > 0

    sectionEl.innerHTML = `<div class="todo-title">${title}</div>`

    if (hasTodos) {
      const cols = document.createElement('div')
      cols.className = 'todo-columns'

      // Pending column
      const pendingCol = document.createElement('div')
      pendingCol.className = 'todo-col'
      pendingCol.innerHTML = '<div class="todo-col-label">Pending</div>'
      const pendingList = document.createElement('ul')
      pendingList.className = 'todo-list pending-list'
      pending.forEach(t => pendingList.appendChild(createTodoItem(t)))
      pendingCol.appendChild(pendingList)
      const addLink = createAddLink()
      pendingCol.appendChild(addLink)
      cols.appendChild(pendingCol)

      // Completed column
      const completedCol = document.createElement('div')
      completedCol.className = 'todo-col'
      completedCol.innerHTML = '<div class="todo-col-label">Completed</div>'
      const completedList = document.createElement('ul')
      completedList.className = 'todo-list completed-list'
      completed.forEach(t => completedList.appendChild(createTodoItem(t)))
      completedCol.appendChild(completedList)
      cols.appendChild(completedCol)

      sectionEl.appendChild(cols)
    } else {
      sectionEl.appendChild(createAddLink())
    }
  }

  function createTodoItem(todo) {
    const li = document.createElement('li')
    li.className = 'todo-item' + (todo.completed ? ' completed' : '')

    const check = document.createElement('span')
    check.className = 'todo-check'
    check.textContent = todo.completed ? '✓' : ''

    const text = document.createElement('span')
    text.className = 'todo-text'
    text.textContent = todo.task

    const del = document.createElement('span')
    del.className = 'todo-delete'
    del.textContent = '×'
    del.title = 'Delete task'

    li.appendChild(check)
    li.appendChild(text)
    li.appendChild(del)

    // Circle click → toggle completion
    check.addEventListener('click', (e) => {
      e.stopPropagation()
      li.style.pointerEvents = 'none'
      toggleTodo(todo.id, !todo.completed)
        .then(() => {
          todos = todos.map(t => t.id === todo.id ? { ...t, completed: !t.completed } : t)
          render()
        })
        .catch(() => {
          showToast('Could not update task', 'error')
          li.style.pointerEvents = ''
        })
    })

    // Text click → edit inline
    text.addEventListener('click', (e) => {
      e.stopPropagation()
      const input = document.createElement('input')
      input.type = 'text'
      input.className = 'todo-add-input'
      input.value = todo.task
      text.replaceWith(input)
      input.focus()
      input.select()

      let committed = false
      async function commitEdit() {
        if (committed) return
        committed = true
        const newTask = input.value.trim()
        if (!newTask || newTask === todo.task) { render(); return }
        try {
          await updateTodo(todo.id, newTask)
          todos = todos.map(t => t.id === todo.id ? { ...t, task: newTask } : t)
          render()
        } catch (_) {
          showToast('Could not update task', 'error')
          render()
        }
      }
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') commitEdit()
        if (e.key === 'Escape') { committed = true; render() }
      })
      input.addEventListener('blur', commitEdit)
    })

    // Delete button
    del.addEventListener('click', async (e) => {
      e.stopPropagation()
      try {
        await deleteTodo(todo.id)
        todos = todos.filter(t => t.id !== todo.id)
        render()
      } catch (_) {
        showToast('Could not delete task', 'error')
      }
    })

    return li
  }

  function createAddLink() {
    const link = document.createElement('span')
    link.className = 'todo-add-link'
    link.textContent = '+ Add a task'
    link.addEventListener('click', showAddInput)
    return link
  }

  function showAddInput() {
    const addLink = sectionEl.querySelector('.todo-add-link')
    if (!addLink) return
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'todo-add-input'
    input.placeholder = 'What do you want to do?'
    addLink.replaceWith(input)
    input.focus()

    let committed = false
    async function commit() {
      if (committed) return
      committed = true
      const text = input.value.trim()
      if (!text) { render(); return }
      try {
        const newTodo = await addTodo(date, text)
        todos.push(newTodo)
        render()
      } catch (err) {
        showToast('Could not add task', 'error')
        render()
      }
    }
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') commit()
      if (e.key === 'Escape') { committed = true; render() }
    })
    input.addEventListener('blur', commit)
  }

  render()
}

// ── Image Helpers ────────────────────────────────────────────────────────────

async function compressImage(file, maxWidth = 1200, quality = 0.8) {
  // Read as data URL first — Safari can decode HEIC via this path where
  // createObjectURL sometimes fails in the Canvas pipeline.
  const dataUrl = await new Promise((res, rej) => {
    const reader = new FileReader()
    reader.onload = e => res(e.target.result)
    reader.onerror = () => rej(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round(height * maxWidth / width)
        width = maxWidth
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('Compression failed')); return }
        resolve(blob)
      }, 'image/jpeg', quality)
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}

async function uploadImage(entryId, entryDate, file) {
  const user = window._currentUser
  if (!user) throw new Error('Not authenticated')
  if (file.size > 5 * 1024 * 1024) throw new Error('File too large (max 5MB)')

  const blob       = await compressImage(file)
  const timestamp  = Date.now()
  const safeName   = (file.name || 'image.jpg').replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `${user.id}/${entryDate}/${timestamp}_${safeName}`

  const { error: uploadErr } = await db.storage
    .from('diary-images')
    .upload(storagePath, blob, { contentType: 'image/jpeg' })
  if (uploadErr) throw uploadErr

  const { data: existing } = await db
    .from('entry_images')
    .select('display_order')
    .eq('entry_id', entryId)
    .order('display_order', { ascending: false })
    .limit(1)
  const displayOrder = existing?.length ? existing[0].display_order + 1 : 0

  const { data, error: dbErr } = await db
    .from('entry_images')
    .insert({ entry_id: entryId, user_id: user.id, storage_path: storagePath, display_order: displayOrder })
    .select()
    .single()
  if (dbErr) {
    await db.storage.from('diary-images').remove([storagePath])
    throw dbErr
  }
  return data
}

async function getEntryImages(entryId) {
  const { data, error } = await db
    .from('entry_images')
    .select('id, storage_path, display_order')
    .eq('entry_id', entryId)
    .order('display_order', { ascending: true })
  if (error) throw error
  if (!data?.length) return []

  const results = []
  for (const row of data) {
    const { data: urlData } = await db.storage
      .from('diary-images')
      .createSignedUrl(row.storage_path, 3600)
    if (urlData?.signedUrl) {
      results.push({ id: row.id, url: urlData.signedUrl, display_order: row.display_order, storage_path: row.storage_path })
    }
  }
  return results
}

async function deleteImage(imageId, storagePath) {
  const { error } = await db.from('entry_images').delete().eq('id', imageId)
  if (error) throw error
  await db.storage.from('diary-images').remove([storagePath])
}

async function getFirstImagesForEntries(entryIds) {
  if (!entryIds.length) return {}
  const { data, error } = await db
    .from('entry_images')
    .select('entry_id, storage_path')
    .in('entry_id', entryIds)
    .eq('display_order', 0)
  if (error || !data?.length) return {}

  const { data: urls } = await db.storage
    .from('diary-images')
    .createSignedUrls(data.map(r => r.storage_path), 3600)

  const map = {}
  data.forEach((row, i) => {
    const signedUrl = urls?.[i]?.signedUrl
    if (signedUrl) map[row.entry_id] = signedUrl
  })
  return map
}

async function initPhotoStrip(stripEl, entryRef, entryDate, getContent) {
  let images = []

  async function loadImages() {
    if (!entryRef.id) return
    try { images = await getEntryImages(entryRef.id) } catch (_) {}
  }

  function renderStrip() {
    stripEl.innerHTML = ''
    images.forEach(img => stripEl.appendChild(createThumb(img)))
    if (images.length < 3) stripEl.appendChild(createAddSlot())
  }

  function createThumb(img) {
    const thumb = document.createElement('div')
    thumb.className = 'photo-thumb'
    const imgEl = document.createElement('img')
    imgEl.src = img.url
    imgEl.alt = 'Diary photo'
    const removeBtn = document.createElement('button')
    removeBtn.className = 'photo-remove'
    removeBtn.innerHTML = '&times;'
    removeBtn.title = 'Remove photo'
    removeBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      removeBtn.disabled = true
      try {
        await deleteImage(img.id, img.storage_path)
        images = images.filter(i => i.id !== img.id)
        renderStrip()
      } catch (err) {
        showToast('Failed to remove photo: ' + err.message, 'error')
        removeBtn.disabled = false
      }
    })
    thumb.appendChild(imgEl)
    thumb.appendChild(removeBtn)
    return thumb
  }

  function createAddSlot() {
    const slot = document.createElement('div')
    slot.className = 'photo-add-slot'
    slot.innerHTML = '<span class="photo-add-icon">+</span><span class="photo-add-label">Add Photo</span>'
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/*'
    fileInput.style.display = 'none'
    slot.appendChild(fileInput)
    slot.addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0]
      if (!file) return
      fileInput.value = ''
      await handleFileSelected(file)
    })
    return slot
  }

  async function handleFileSelected(file) {
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif' ||
                   /\.(heic|heif)$/i.test(file.name)
    if (isHeic) {
      try {
        const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
        file = Array.isArray(converted) ? converted[0] : converted
      } catch (err) {
        showToast('Could not convert HEIC: ' + err.message, 'error')
        return
      }
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('File too large (max 5MB)', 'error')
      return
    }
    // Ensure entry exists before uploading
    if (!entryRef.id) {
      try {
        const saved = await upsertEntry(entryDate, getContent ? getContent() : '')
        entryRef.id = saved.id
      } catch (err) {
        showToast('Could not save entry: ' + err.message, 'error')
        return
      }
    }
    // Optimistic preview
    const previewUrl = URL.createObjectURL(file)
    const tempThumb = document.createElement('div')
    tempThumb.className = 'photo-thumb uploading'
    const previewImg = document.createElement('img')
    previewImg.src = previewUrl
    tempThumb.appendChild(previewImg)
    const addSlot = stripEl.querySelector('.photo-add-slot')
    stripEl.insertBefore(tempThumb, addSlot || null)
    try {
      await uploadImage(entryRef.id, entryDate, file)
      URL.revokeObjectURL(previewUrl)
      images = await getEntryImages(entryRef.id)
      renderStrip()
    } catch (err) {
      URL.revokeObjectURL(previewUrl)
      tempThumb.remove()
      showToast('Upload failed: ' + err.message, 'error')
    }
  }

  await loadImages()
  renderStrip()
}

// ── AI Helper ────────────────────────────────────────────────────────────────

async function suggestBetterEnglish(text) {
  const response = await fetch(GROQ_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  })

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    throw new Error(errData.error?.message || `Groq API error: ${response.status}`)
  }

  const data = await response.json()
  const raw = data.choices?.[0]?.message?.content || ''

  console.log('[AI raw response]', raw)

  const improvedMatch  = raw.match(/IMPROVED[:\*]*\s*([\s\S]*?)(?=WHAT I CHANGED|$)/i)
  const changesMatch   = raw.match(/WHAT I CHANGED[:\*]*\s*([\s\S]*?)(?=WRITING ANALYSIS|$)/i)
  const analysisMatch  = raw.match(/WRITING ANALYSIS[:\*]*\s*([\s\S]*?)$/i)

  const improved     = improvedMatch  ? improvedMatch[1].trim()  : raw.trim()
  const changesRaw   = changesMatch   ? changesMatch[1].trim()   : ''
  const analysisRaw  = analysisMatch  ? analysisMatch[1].trim()  : ''

  const parseBullets = raw => raw
    .split('\n')
    .map(l => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)

  return { improved, changes: parseBullets(changesRaw), analysis: parseBullets(analysisRaw) }
}

// ── AI Suggestion UI Helpers ─────────────────────────────────────────────────

function updateLineNumbers(el, lineNumEl) {
  // el can be a textarea or a div with text content
  const text = el.tagName === 'TEXTAREA' ? el.value : (el.textContent || '')
  const count = text ? text.split('\n').length : 1
  lineNumEl.innerHTML = Array.from({ length: count }, (_, i) => `<div>${i + 1}</div>`).join('')
}

function initLineNumbers(textarea, lineNumEl) {
  updateLineNumbers(textarea, lineNumEl)
  textarea.addEventListener('input', () => updateLineNumbers(textarea, lineNumEl))
  textarea.addEventListener('scroll', () => { lineNumEl.scrollTop = textarea.scrollTop })
}

function activateSplit(container) {
  const layout = container.querySelector('.editor-layout')
  if (layout) layout.classList.add('split')
  const containerEl = document.querySelector('.container')
  if (containerEl) containerEl.classList.add('wide')
  const bottomPanel = container.querySelector('.ai-bottom-panel')
  if (bottomPanel) bottomPanel.classList.add('visible')
}

function deactivateSplit(container) {
  const layout = container.querySelector('.editor-layout')
  if (layout) layout.classList.remove('split')
  const containerEl = document.querySelector('.container')
  if (containerEl) containerEl.classList.remove('wide')
  const bottomPanel = container.querySelector('.ai-bottom-panel')
  if (bottomPanel) bottomPanel.classList.remove('visible')
}

function renderAiBox(container, result) {
  const aiBox = container.querySelector('.ai-box')
  if (!aiBox) return

  const improvedEl = aiBox.querySelector('.ai-improved-text')
  if (improvedEl) improvedEl.textContent = result.improved

  const bottomPanel = container.querySelector('.ai-bottom-panel')
  if (bottomPanel) {
    const changesList = bottomPanel.querySelector('.ai-changes-list')
    if (changesList) {
      changesList.innerHTML = ''
      result.changes.forEach(c => {
        const li = document.createElement('li')
        li.textContent = c
        changesList.appendChild(li)
      })
    }

    const analysisList = bottomPanel.querySelector('.ai-analysis-list')
    if (analysisList) {
      analysisList.innerHTML = ''
      ;(result.analysis || []).forEach(a => {
        const li = document.createElement('li')
        li.textContent = a
        analysisList.appendChild(li)
      })
    }
  }

  activateSplit(container)

  // Sync AI line numbers
  const aiLineNums = container.querySelector('#line-numbers-ai')
  if (aiLineNums && improvedEl) updateLineNumbers(improvedEl, aiLineNums)
}

function setupAiButton(container, getTextFn, onSuggestionReady, onClose) {
  const btn      = container.querySelector('.btn-ai')
  const textarea = container.querySelector('.diary-textarea')
  const aiBox    = container.querySelector('.ai-box')
  const closeBtn = aiBox ? aiBox.querySelector('.ai-box-close') : null

  if (!btn) return

  btn.addEventListener('click', async () => {
    const text = getTextFn()
    if (!text.trim()) return

    const originalHTML = btn.innerHTML
    btn.disabled = true
    btn.innerHTML = '<span class="spinner"></span> Suggesting…'

    try {
      const result = await suggestBetterEnglish(text)
      renderAiBox(container, result)
      if (onSuggestionReady) onSuggestionReady(result)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      btn.disabled = false
      btn.innerHTML = originalHTML
    }
  })

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      deactivateSplit(container)
      if (onClose) onClose()
    })
  }

  if (textarea) {
    const updateBtnState = () => { btn.disabled = !textarea.value.trim() }
    textarea.addEventListener('input', updateBtnState)
    updateBtnState()
  }
}

// ── Page: Index ──────────────────────────────────────────────────────────────

async function initIndexPage() {
  const user = await requireAuth()
  if (!user) return

  const container   = document.querySelector('.page-container')
  const textarea    = document.getElementById('diary-content')
  const dateEl      = document.getElementById('date-display')
  const saveInd     = document.getElementById('save-indicator')
  const historyBtn  = document.getElementById('btn-history')

  addSignOutButton()

  if (!textarea) return

  // Use ?date= param if present, otherwise today
  const urlParams = new URLSearchParams(window.location.search)
  const dateParam = urlParams.get('date')
  const today = dateParam || getTodayString()

  if (dateEl) {
    const d = new Date(today + 'T00:00:00')
    const dow = d.toLocaleDateString('en-US', { weekday: 'long' })
    const rest = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    dateEl.innerHTML = `<span class="day-of-week">${dow}</span>${rest}`
  }

  const entryRef = { id: null }

  // Load entry for this date + saved suggestion
  try {
    const { data: entry, error: loadErr } = await db
      .from('diary_entries')
      .select('*')
      .eq('date', today)
      .maybeSingle()
    if (loadErr) throw loadErr
    if (entry) {
      entryRef.id = entry.id
      textarea.value = entry.content
      if (entry.ai_suggestion) {
        try { renderAiBox(container, JSON.parse(entry.ai_suggestion)) } catch (_) {}
      }
    }
  } catch (err) {
    showToast('Failed to load entry: ' + err.message, 'error')
  }

  // Photo strip
  const stripEl = document.getElementById('photo-strip')
  if (stripEl) await initPhotoStrip(stripEl, entryRef, today, () => textarea.value)

  // Todo section
  const todoSectionEl = document.getElementById('todo-section')
  if (todoSectionEl) await initTodoSection(todoSectionEl, today)

  // Auto-save with debounce
  const doSave = debounce(async () => {
    const content = textarea.value
    if (saveInd) { saveInd.textContent = 'Saving…'; saveInd.className = 'save-indicator saving' }
    try {
      const saved = await upsertEntry(today, content)
      entryRef.id = saved.id
      if (saveInd) { saveInd.textContent = 'Saved ✓'; saveInd.className = 'save-indicator saved' }
    } catch (err) {
      if (saveInd) { saveInd.textContent = 'Save failed'; saveInd.className = 'save-indicator error' }
      showToast('Save failed: ' + err.message, 'error')
    }
  }, 2000)

  textarea.addEventListener('input', doSave)

  // Line numbers
  const lineNumsOrig = document.getElementById('line-numbers-orig')
  if (lineNumsOrig) initLineNumbers(textarea, lineNumsOrig)

  // AI button — auto-save suggestion when generated, clear when closed
  if (container) {
    setupAiButton(container, () => textarea.value, async (result) => {
      try { await saveAiSuggestion(today, result) } catch (_) {}
    }, async () => {
      try { await saveAiSuggestion(today, null) } catch (_) {}
    })
  }

  // History nav
  if (historyBtn) {
    historyBtn.addEventListener('click', () => {
      window.location.href = 'history.html'
    })
  }
}

// ── Page: History ────────────────────────────────────────────────────────────

async function initHistoryPage() {
  const user = await requireAuth()
  if (!user) return

  addSignOutButton()

  const calendarView = document.getElementById('calendar-view')
  const listView     = document.getElementById('list-view')
  const btnCal       = document.getElementById('toggle-calendar')
  const btnList      = document.getElementById('toggle-list')
  const backBtn      = document.getElementById('btn-back')

  if (backBtn) backBtn.addEventListener('click', () => { window.location.href = 'index.html' })

  // Toggle views
  function showCalendar() {
    calendarView.style.display = 'block'
    listView.style.display = 'none'
    btnCal.classList.add('active')
    btnList.classList.remove('active')
  }

  function showList() {
    calendarView.style.display = 'none'
    listView.style.display = 'block'
    btnList.classList.add('active')
    btnCal.classList.remove('active')
  }

  if (btnCal)  btnCal.addEventListener('click', showCalendar)
  if (btnList) btnList.addEventListener('click', showList)

  // Load all entries
  let allEntries = []
  try {
    allEntries = await getAllEntries()
  } catch (err) {
    showToast('Failed to load entries: ' + err.message, 'error')
  }

  // Load first images for all entries
  let imageMap = {}
  try {
    imageMap = await getFirstImagesForEntries(allEntries.map(e => e.id))
  } catch (_) {}

  // Build entry date lookup: { "YYYY-MM-DD": entry }
  const entryMap = {}
  allEntries.forEach(e => { entryMap[e.date] = e })

  // ── Calendar ──
  const today = getTodayString()
  const todayDate = new Date(today + 'T00:00:00')
  let calYear  = todayDate.getFullYear()
  let calMonth = todayDate.getMonth() + 1 // 1-based

  function renderCalendar() {
    const monthLabel = document.getElementById('calendar-month-label')
    const grid       = document.getElementById('calendar-grid')
    if (!grid) return

    const monthName = new Date(calYear, calMonth - 1, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (monthLabel) monthLabel.textContent = monthName

    grid.innerHTML = ''

    // Day of week headers
    const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    dows.forEach(d => {
      const el = document.createElement('div')
      el.className = 'calendar-dow'
      el.textContent = d
      grid.appendChild(el)
    })

    // First day of month
    const firstDay = new Date(calYear, calMonth - 1, 1).getDay() // 0=Sun
    const daysInMonth = new Date(calYear, calMonth, 0).getDate()

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      const el = document.createElement('div')
      el.className = 'calendar-day empty'
      grid.appendChild(el)
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const el = document.createElement('div')
      el.className = 'calendar-day'
      el.textContent = day

      const isToday = dateStr === today
      const isPast  = dateStr < today
      const hasEntry = !!entryMap[dateStr]

      if (isToday) el.classList.add('today')

      if (hasEntry) {
        el.classList.add('has-entry')
        if (imageMap[entryMap[dateStr].id]) el.classList.add('has-image')
        el.title = formatDateShort(dateStr)
        el.addEventListener('click', () => {
          window.location.href = `entry.html?id=${entryMap[dateStr].id}`
        })
      } else {
        el.classList.add('past-day')
        el.title = formatDateShort(dateStr)
        el.addEventListener('click', () => {
          window.location.href = `index.html?date=${dateStr}`
        })
      }

      grid.appendChild(el)
    }
  }

  const prevBtn = document.getElementById('cal-prev')
  const nextBtn = document.getElementById('cal-next')

  if (prevBtn) prevBtn.addEventListener('click', () => {
    calMonth--
    if (calMonth < 1) { calMonth = 12; calYear-- }
    renderCalendar()
  })

  if (nextBtn) nextBtn.addEventListener('click', () => {
    calMonth++
    if (calMonth > 12) { calMonth = 1; calYear++ }
    renderCalendar()
  })

  renderCalendar()

  // ── List View ──
  function renderList() {
    const listEl = document.getElementById('entry-list')
    if (!listEl) return
    listEl.innerHTML = ''

    if (allEntries.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No diary entries yet. Start writing today!</div>'
      return
    }

    allEntries.forEach(entry => {
      const card = document.createElement('div')
      card.className = 'entry-card'
      card.addEventListener('click', () => {
        window.location.href = `entry.html?id=${entry.id}`
      })

      const imgUrl = imageMap[entry.id]
      if (imgUrl) {
        const thumb = document.createElement('img')
        thumb.className = 'entry-card-thumb'
        thumb.src = imgUrl
        thumb.alt = ''
        card.appendChild(thumb)
      }

      const textWrap = document.createElement('div')
      textWrap.className = 'entry-card-text'

      const dateEl = document.createElement('div')
      dateEl.className = 'entry-card-date'
      dateEl.textContent = formatDate(entry.date)

      const preview = document.createElement('div')
      const previewText = entry.content ? entry.content.slice(0, 100) + (entry.content.length > 100 ? '…' : '') : ''
      preview.className = 'entry-card-preview' + (previewText ? '' : ' empty-preview')
      preview.textContent = previewText || '(empty entry)'

      textWrap.appendChild(dateEl)
      textWrap.appendChild(preview)
      card.appendChild(textWrap)
      listEl.appendChild(card)
    })
  }

  renderList()

  // Default view: calendar
  showCalendar()
}

// ── Page: Entry ──────────────────────────────────────────────────────────────

async function initEntryPage() {
  const user = await requireAuth()
  if (!user) return

  addSignOutButton()

  const container  = document.querySelector('.page-container')
  const textarea   = document.getElementById('diary-content')
  const dateEl     = document.getElementById('date-display')
  const saveBtn    = document.getElementById('btn-save')
  const backBtn    = document.getElementById('btn-back')

  if (!textarea) return

  // Get id from URL
  const params = new URLSearchParams(window.location.search)
  const id = params.get('id')

  if (!id) {
    window.location.href = 'history.html'
    return
  }

  let originalContent = ''
  let currentEntry = null

  // Load entry
  try {
    currentEntry = await getEntryById(id)
    if (!currentEntry) {
      showToast('Entry not found', 'error')
      setTimeout(() => { window.location.href = 'history.html' }, 1200)
      return
    }

    if (dateEl) {
      const d = new Date(currentEntry.date + 'T00:00:00')
      const dow = d.toLocaleDateString('en-US', { weekday: 'long' })
      const rest = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      dateEl.innerHTML = `<span class="day-of-week">${dow}</span>${rest}`
    }

    textarea.value = currentEntry.content
    originalContent = currentEntry.content
    // Load saved suggestion if exists
    if (currentEntry.ai_suggestion) {
      try { renderAiBox(container, JSON.parse(currentEntry.ai_suggestion)) } catch (_) {}
    }
  } catch (err) {
    showToast('Failed to load entry: ' + err.message, 'error')
    setTimeout(() => { window.location.href = 'history.html' }, 1200)
    return
  }

  // Photo strip
  const stripEl = document.getElementById('photo-strip')
  if (stripEl) {
    const entryRef = { id: currentEntry.id }
    await initPhotoStrip(stripEl, entryRef, currentEntry.date, () => textarea.value)
  }

  // Todo section
  const todoSectionEl = document.getElementById('todo-section')
  if (todoSectionEl) await initTodoSection(todoSectionEl, currentEntry.date)

  // Save button
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true
      const originalHTML = saveBtn.innerHTML
      saveBtn.innerHTML = '<span class="spinner"></span> Saving…'
      try {
        await upsertEntry(currentEntry.date, textarea.value)
        originalContent = textarea.value
        showToast('Saved!', 'success')
      } catch (err) {
        showToast('Save failed: ' + err.message, 'error')
      } finally {
        saveBtn.disabled = false
        saveBtn.innerHTML = originalHTML
      }
    })
  }

  // Back button with unsaved-change guard
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (textarea.value !== originalContent) {
        if (!confirm('You have unsaved changes. Leave without saving?')) return
      }
      window.location.href = 'history.html'
    })
  }

  // Line numbers
  const lineNumsOrig = document.getElementById('line-numbers-orig')
  if (lineNumsOrig) initLineNumbers(textarea, lineNumsOrig)

  // AI button — auto-save suggestion when generated, clear when closed
  if (container) {
    setupAiButton(container, () => textarea.value, async (result) => {
      try { await saveAiSuggestion(currentEntry.date, result) } catch (_) {}
    }, async () => {
      try { await saveAiSuggestion(currentEntry.date, null) } catch (_) {}
    })
  }
}

// ── Profile Helpers ──────────────────────────────────────────────────────────

async function getProfile(userId) {
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function updateProfile(userId, fields) {
  const { error } = await db
    .from('profiles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}

async function ensureProfile(user) {
  const existing = await getProfile(user.id)
  if (!existing) {
    // First sign-in: insert a blank row (INSERT policy applies)
    const { error } = await db
      .from('profiles')
      .insert({ id: user.id })
    if (error && error.code !== '23505') throw error // ignore duplicate-key race
  }
  return existing || {}
}

async function uploadAvatar(userId, file) {
  const blob = await compressImage(file, 256, 0.85)
  const storagePath = `${userId}/avatar`
  const { error } = await db.storage
    .from('diary-images')
    .upload(storagePath, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
  // Return the storage path; callers resolve a fresh signed URL when displaying
  return storagePath
}

async function getAvatarUrl(storagePath) {
  if (!storagePath) return null
  // Already a full URL (legacy or external)
  if (storagePath.startsWith('http')) return storagePath
  const { data } = await db.storage
    .from('diary-images')
    .createSignedUrl(storagePath, 3600 * 24) // 24-hour URL
  return data?.signedUrl || null
}

// ── User Menu (avatar + dropdown) ────────────────────────────────────────────

async function addSignOutButton() {
  const header = document.querySelector('.app-header')
  if (!header || header.querySelector('.user-menu')) return

  const user = window._currentUser
  if (!user) return

  let profile = {}
  try { profile = await ensureProfile(user) } catch (_) {}

  const emailPrefix = user.email ? user.email.split('@')[0] : 'User'
  const displayName = profile.display_name || emailPrefix

  // Resolve avatar storage path → signed URL
  let avatarDisplayUrl = null
  if (profile.avatar_url) {
    try { avatarDisplayUrl = await getAvatarUrl(profile.avatar_url) } catch (_) {}
  }

  const menu = document.createElement('div')
  menu.className = 'user-menu'

  const trigger = document.createElement('button')
  trigger.className = 'user-menu-trigger'
  trigger.setAttribute('aria-haspopup', 'true')
  trigger.setAttribute('aria-expanded', 'false')

  const avatar = document.createElement('div')
  avatar.className = 'user-avatar'
  if (avatarDisplayUrl) {
    const img = document.createElement('img')
    img.src = avatarDisplayUrl
    img.alt = displayName
    avatar.appendChild(img)
  } else {
    avatar.textContent = displayName[0].toUpperCase()
  }

  const nameEl = document.createElement('span')
  nameEl.className = 'user-menu-name'
  nameEl.textContent = displayName

  const chevron = document.createElement('span')
  chevron.className = 'user-menu-chevron'
  chevron.innerHTML = '&#8964;'

  trigger.appendChild(avatar)
  trigger.appendChild(nameEl)
  trigger.appendChild(chevron)

  const dropdown = document.createElement('div')
  dropdown.className = 'user-dropdown'

  const editItem = document.createElement('button')
  editItem.className = 'user-dropdown-item'
  editItem.textContent = 'Edit Profile'
  editItem.addEventListener('click', () => {
    dropdown.classList.remove('open')
    trigger.setAttribute('aria-expanded', 'false')
    openProfileModal(user, profile, avatarDisplayUrl, async (updated, newAvatarDisplayUrl) => {
      profile = updated
      avatarDisplayUrl = newAvatarDisplayUrl
      const newName = updated.display_name || emailPrefix
      nameEl.textContent = newName
      avatar.innerHTML = ''
      if (newAvatarDisplayUrl) {
        const img = document.createElement('img')
        img.src = newAvatarDisplayUrl
        img.alt = newName
        avatar.appendChild(img)
      } else {
        avatar.textContent = newName[0].toUpperCase()
      }
    })
  })

  const signOutItem = document.createElement('button')
  signOutItem.className = 'user-dropdown-item user-dropdown-item--danger'
  signOutItem.textContent = 'Sign Out'
  signOutItem.addEventListener('click', signOut)

  dropdown.appendChild(editItem)
  dropdown.appendChild(signOutItem)

  menu.appendChild(trigger)
  menu.appendChild(dropdown)
  header.appendChild(menu)

  trigger.addEventListener('click', (e) => {
    e.stopPropagation()
    const isOpen = dropdown.classList.toggle('open')
    trigger.setAttribute('aria-expanded', String(isOpen))
  })

  document.addEventListener('click', () => {
    dropdown.classList.remove('open')
    trigger.setAttribute('aria-expanded', 'false')
  })
}

// ── Profile Modal ────────────────────────────────────────────────────────────

function openProfileModal(user, profile, avatarDisplayUrl, onSave) {
  // Remove any existing modal
  document.getElementById('profile-modal')?.remove()

  const overlay = document.createElement('div')
  overlay.id = 'profile-modal'
  overlay.className = 'modal-overlay'

  const card = document.createElement('div')
  card.className = 'modal-card paper-card'

  card.innerHTML = `
    <div class="modal-header">
      <h2 class="modal-title">Edit Profile</h2>
      <button class="modal-close" aria-label="Close">&times;</button>
    </div>

    <div class="modal-section">
      <div class="modal-avatar-row">
        <div class="modal-avatar-preview" id="modal-avatar-preview">
          ${avatarDisplayUrl
            ? `<img src="${avatarDisplayUrl}" alt="Avatar">`
            : `<span>${(profile.display_name || user.email || 'U')[0].toUpperCase()}</span>`}
        </div>
        <div>
          <label class="modal-avatar-btn btn" id="modal-avatar-label">
            Change Photo
            <input type="file" id="modal-avatar-input" accept="image/*" style="display:none">
          </label>
          <div class="modal-avatar-hint">Square image recommended</div>
        </div>
      </div>
    </div>

    <div class="modal-section">
      <div class="auth-field">
        <label for="modal-display-name">Display Name</label>
        <input type="text" id="modal-display-name" value="${profile.display_name || ''}" placeholder="How should we call you?">
      </div>
    </div>

    <div class="modal-section modal-section--password">
      <div class="modal-section-title">Change Password</div>
      <div class="auth-field">
        <label for="modal-new-password">New Password</label>
        <input type="password" id="modal-new-password" placeholder="Leave blank to keep current">
      </div>
    </div>

    <div class="modal-error" id="modal-error"></div>

    <div class="modal-actions">
      <button class="btn" id="modal-cancel">Cancel</button>
      <button class="btn btn-primary" id="modal-save">Save</button>
    </div>
  `

  overlay.appendChild(card)
  document.body.appendChild(overlay)

  // Force reflow then animate in
  requestAnimationFrame(() => overlay.classList.add('open'))

  let pendingAvatarFile = null
  let pendingAvatarStoragePath = profile.avatar_url || null  // storage path
  let pendingAvatarDisplayUrl  = avatarDisplayUrl || null    // resolved signed URL

  const avatarInput = card.querySelector('#modal-avatar-input')
  const avatarPreview = card.querySelector('#modal-avatar-preview')

  avatarInput.addEventListener('change', () => {
    const file = avatarInput.files[0]
    if (!file) return
    pendingAvatarFile = file
    pendingAvatarDisplayUrl = URL.createObjectURL(file)
    avatarPreview.innerHTML = `<img src="${pendingAvatarDisplayUrl}" alt="Preview">`
  })

  function close() {
    overlay.classList.remove('open')
    setTimeout(() => overlay.remove(), 220)
  }

  card.querySelector('.modal-close').addEventListener('click', close)
  card.querySelector('#modal-cancel').addEventListener('click', close)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })

  card.querySelector('#modal-save').addEventListener('click', async () => {
    const saveBtn = card.querySelector('#modal-save')
    const errorEl = card.querySelector('#modal-error')
    const displayName = card.querySelector('#modal-display-name').value.trim()
    const newPassword = card.querySelector('#modal-new-password').value

    errorEl.textContent = ''
    saveBtn.disabled = true
    saveBtn.textContent = 'Saving…'

    try {
      // Upload avatar if changed; returns storage path
      if (pendingAvatarFile) {
        pendingAvatarStoragePath = await uploadAvatar(user.id, pendingAvatarFile)
        // pendingAvatarDisplayUrl already set to object URL from the change handler
      }

      // Update profile row (store storage path, not signed URL)
      await updateProfile(user.id, {
        display_name: displayName || null,
        avatar_url: pendingAvatarStoragePath || null
      })

      // Update password if provided
      if (newPassword) {
        const { error } = await db.auth.updateUser({ password: newPassword })
        if (error) throw error
      }

      const updated = { ...profile, display_name: displayName || null, avatar_url: pendingAvatarStoragePath || null }
      onSave(updated, pendingAvatarDisplayUrl)
      showToast('Profile saved!', 'success')
      close()
    } catch (err) {
      errorEl.textContent = err.message
      saveBtn.disabled = false
      saveBtn.textContent = 'Save'
    }
  })
}

// ── Page: Auth ───────────────────────────────────────────────────────────────

async function initAuthPage() {
  // If already signed in, skip to the app
  const { data: { session } } = await db.auth.getSession()
  if (session) {
    window.location.href = 'index.html'
    return
  }

  const tabSignIn  = document.getElementById('tab-signin')
  const tabSignUp  = document.getElementById('tab-signup')
  const formSignIn = document.getElementById('form-signin')
  const formSignUp = document.getElementById('form-signup')

  tabSignIn.addEventListener('click', () => {
    tabSignIn.classList.add('active')
    tabSignUp.classList.remove('active')
    formSignIn.style.display = 'block'
    formSignUp.style.display = 'none'
  })

  tabSignUp.addEventListener('click', () => {
    tabSignUp.classList.add('active')
    tabSignIn.classList.remove('active')
    formSignUp.style.display = 'block'
    formSignIn.style.display = 'none'
  })

  formSignIn.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email    = document.getElementById('signin-email').value.trim()
    const password = document.getElementById('signin-password').value
    const errEl    = document.getElementById('signin-error')
    const btn      = formSignIn.querySelector('.auth-submit')
    errEl.textContent = ''
    btn.disabled = true
    btn.textContent = 'Signing in…'
    try {
      await signIn(email, password)
    } catch (err) {
      errEl.textContent = err.message
      btn.disabled = false
      btn.textContent = 'Sign In'
    }
  })

  formSignUp.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email    = document.getElementById('signup-email').value.trim()
    const password = document.getElementById('signup-password').value
    const confirm  = document.getElementById('signup-confirm').value
    const errEl    = document.getElementById('signup-error')
    const btn      = formSignUp.querySelector('.auth-submit')
    errEl.textContent = ''
    if (password !== confirm) {
      errEl.textContent = 'Passwords do not match.'
      return
    }
    btn.disabled = true
    btn.textContent = 'Creating account…'
    try {
      await signUp(email, password)
    } catch (err) {
      errEl.textContent = err.message
      btn.disabled = false
      btn.textContent = 'Create Account'
    }
  })
}

// ── Auto-init based on page ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page
  if (page === 'index')   initIndexPage()
  if (page === 'history') initHistoryPage()
  if (page === 'entry')   initEntryPage()
  if (page === 'auth')    initAuthPage()
})

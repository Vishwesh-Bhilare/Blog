// Minimal, dependency-free markdown blog loader.
// Usage: add posts to /posts/ and append an entry to posts.json
// posts.json example:
// [
//   {"slug":"why-gesture-fail","title":"Why 90% of Gesture-Control Projects Feel Bad to Use","file":"posts/why-gesture-fail.md","date":"2026-02-01"}
// ]

const qs = selector => document.querySelector(selector);
const postListEl = qs('#post-list');
const postTitleEl = qs('#post-title');
const postBodyEl = qs('#post-body');
const postSubmeta = qs('#post-submeta');
const openRawBtn = qs('#open-raw');
const copyLinkBtn = qs('#copy-link');
const siteTitle = qs('#site-title');
const toggleListBtn = qs('#toggle-list');

let posts = [];
let current = null;

async function init(){
  try{
    posts = await fetchJson('posts.json');
    renderList();
    const initial = getInitialSlug() || (posts[0] && posts[0].slug);
    if(initial) loadPostBySlug(initial);
  }catch(e){
    postTitleEl.textContent = 'Unable to load posts';
    postBodyEl.textContent = e.toString();
    console.error(e);
  }
}

function getInitialSlug(){
  // read ?post=slug or hash
  const url = new URL(location.href);
  if(url.searchParams.get('post')) return url.searchParams.get('post');
  if(location.hash) return location.hash.slice(1);
  return null;
}

function renderList(){
  postListEl.innerHTML = '';
  posts.sort((a,b)=> (b.date||'').localeCompare(a.date||''));
  posts.forEach(p=>{
    const a = document.createElement('a');
    a.className = 'post-item';
    a.href = `#${p.slug}`;
    a.dataset.slug = p.slug;
    a.innerHTML = `<strong>${escapeHtml(p.title)}</strong>
                   <span class="meta">${p.date ? p.date : ''}</span>`;
    a.addEventListener('click', (ev)=>{
      ev.preventDefault();
      loadPostBySlug(p.slug);
      if(window.innerWidth < 880){
        window.scrollTo({top:0,behavior:'smooth'});
      }
    });
    postListEl.appendChild(a);
  });
}

async function loadPostBySlug(slug){
  const meta = posts.find(x=>x.slug===slug);
  if(!meta) return;
  current = meta;
  siteTitle.dataset.slug = slug;
  updateLocation(slug);

  postTitleEl.textContent = 'Loading…';
  postSubmeta.textContent = '';
  postBodyEl.innerHTML = '';

  try{
    const raw = await fetchText(meta.file);
    const {frontmatter, body} = parseFrontmatter(raw);
    const title = frontmatter.title || extractTitle(body) || meta.title || 'Untitled';
    postTitleEl.textContent = title;
    postSubmeta.innerHTML = `${frontmatter.author ? escapeHtml(frontmatter.author) + ' • ' : ''}${meta.date || frontmatter.date || ''}`;
    postBodyEl.innerHTML = renderMarkdown(body);
    // show images w/ relative paths, and add classes (handled by CSS)
  }catch(err){
    postTitleEl.textContent = 'Failed to load';
    postBodyEl.textContent = err.toString();
  }
}

function updateLocation(slug){
  history.replaceState({}, '', `#${slug}`);
}

toggleListBtn?.addEventListener('click', ()=>{
  postListEl.classList.toggle('hidden');
});

openRawBtn?.addEventListener('click', ()=>{
  if(current) window.open(current.file, '_blank');
});

copyLinkBtn?.addEventListener('click', async ()=>{
  const link = `${location.origin}${location.pathname}#${current?.slug||''}`;
  try{
    await navigator.clipboard.writeText(link);
    copyLinkBtn.textContent = 'Copied';
    setTimeout(()=>copyLinkBtn.textContent = 'Copy link',1200);
  }catch(e){ console.warn(e) }
});

/* Utilities */

async function fetchJson(path){
  const r = await fetch(path);
  if(!r.ok) throw new Error(`Failed to fetch ${path} (${r.status})`);
  return r.json();
}
async function fetchText(path){
  const r = await fetch(path);
  if(!r.ok) throw new Error(`Failed to fetch ${path} (${r.status})`);
  return r.text();
}

function escapeHtml(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

// Basic YAML frontmatter parser — supports simple key: value lines
function parseFrontmatter(text){
  if(text.startsWith('---')){
    const end = text.indexOf('\n---',3);
    if(end !== -1){
      const raw = text.slice(3, end+1).trim();
      const rest = text.slice(end+4).trim();
      const obj = {};
      raw.split('\n').forEach(line=>{
        const idx = line.indexOf(':');
        if(idx>-1){
          const k = line.slice(0,idx).trim();
          let v = line.slice(idx+1).trim();
          if(v.startsWith('"') && v.endsWith('"')) v = v.slice(1,-1);
          obj[k]=v;
        }
      });
      return {frontmatter: obj, body: rest};
    }
  }
  return {frontmatter:{}, body: text};
}

function extractTitle(md){
  const m = md.match(/^#\s+(.+?)$/m);
  return m ? m[1].trim() : null;
}

/* Minimal markdown renderer
   Supports:
   - fenced code blocks ```lang
   - headings #..###### 
   - images ![alt](url)
   - links [text](url)
   - bold **text**, italic *text*
   - inline code `code`
   - unordered lists (- or *)
   - ordered lists (1. 2.)
   - paragraphs and blockquotes
   - preserves relative image links as-is
*/
function renderMarkdown(md){
  // Normalize line endings
  md = md.replace(/\r\n/g,'\n');

  // Extract fenced code blocks
  const codeBlocks = [];
  md = md.replace(/```([\w-]*)\n([\s\S]*?)```/g, (m,lang,code)=>{
    const id = codeBlocks.push({lang:lang||'', code}) - 1;
    return `\n\n:::CODEBLOCK_${id}:::\n\n`;
  });

  // Escape HTML to avoid injection, we'll re-insert code blocks and allow simple markdown -> HTML
  md = escapeHtml(md);

  // Headings
  md = md.replace(/^######\s*(.+)$/gm, '<h6>$1</h6>');
  md = md.replace(/^#####\s*(.+)$/gm, '<h5>$1</h5>');
  md = md.replace(/^####\s*(.+)$/gm, '<h4>$1</h4>');
  md = md.replace(/^###\s*(.+)$/gm, '<h3>$1</h3>');
  md = md.replace(/^##\s*(.+)$/gm, '<h2>$1</h2>');
  md = md.replace(/^#\s*(.+)$/gm, '<h1>$1</h1>');

  // Blockquotes
  md = md.replace(/^\>\s*(.+)$/gm, '<blockquote>$1</blockquote>');

  // Images: ![alt](url)
  md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

  // Links: [text](url)
  md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Bold and italic
  md = md.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  md = md.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Inline code `code`
  md = md.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Lists (unordered)
  md = md.replace(/(^|\n)([ \t]*)([-*])\s+(.+)(?=\n|$)/g, (m,prefix,indent,bul,item)=>{
    return `\n<ul>\n<li>${item}</li>\n</ul>\n`;
  });
  // Merge adjacent ULs
  md = md.replace(/<\/ul>\s*<ul>/g, '');

  // Ordered lists: simple handling
  md = md.replace(/(^|\n)(\d+)\.\s+(.+)(?=\n|$)/g, (m,prefix,num,item)=>{
    return `\n<ol>\n<li>${item}</li>\n</ol>\n`;
  });
  md = md.replace(/<\/ol>\s*<ol>/g, '');

  // Paragraphs: split by two newlines
  const parts = md.split(/\n{2,}/).map(p=>{
    if(p.match(/^<\/?(h|ul|ol|li|pre|blockquote|img|p|code|a|strong|em)/)) return p;
    return `<p>${p}</p>`;
  });

  let html = parts.join('\n\n');

  // Re-insert code blocks
  html = html.replace(/:::CODEBLOCK_(\d+):::/g, (_,id)=>{
    const cb = codeBlocks[Number(id)];
    const escaped = escapeHtml(cb.code);
    return `<pre><code class="lang-${escapeHtml(cb.lang)}">${escaped}</code></pre>`;
  });

  // Tidy up stray <p> around lists (best-effort)
  html = html.replace(/<p>\s*(<ul|<ol)/g,'$1');
  html = html.replace(/<\/ul>\s*<\/p>/g,'</ul>');
  html = html.replace(/<\/ol>\s*<\/p>/g,'</ol>');

  return html;
}

init();




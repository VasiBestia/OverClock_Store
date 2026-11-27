# Căutare hardware

Aplicația pornește în modul demonstrativ și citește catalogul local o singură dată. Node.js 22.12 sau mai nou și npm sunt necesare. Din rădăcina proiectului, rulează comenzile de mai jos.

```sh
cd backend
npm ci
cp .env.example .env
npm start
```

În PowerShell, comanda de copiere este `Copy-Item .env.example .env`. Deschide [pagina principală](http://127.0.0.1:3000/) sau [magazinul](http://127.0.0.1:3000/shop.html). Câmpul de căutare se află în antet pe desktop și sub navigare pe mobil.

## DeepSeek API

Modul `demo` nu necesită cheie și nu trimite cereri la furnizori. Pentru căutare prin DeepSeek:

1. Creează o cheie privată în [platforma DeepSeek](https://platform.deepseek.com/api_keys).
2. Creează local `backend/.env` plecând de la `backend/.env.example`.
3. Introdu `SEARCH_MODE=deepseek`, `DEEPSEEK_API_KEY=...` și `DEEPSEEK_MODEL=deepseek-flash`.
4. Rulează `npm start` și deschide `http://127.0.0.1:3000/shop.html`.
5. Testează „GPU NVIDIA minimum 12 GB VRAM” și verifică `interpretation_source: "deepseek"` în răspunsul API. Unele cereri sunt validate local și nu consumă un apel LLM.

Păstrează cheia în mediul procesului backend. În producție, seteaz-o în mecanismul de secrete al platformei.
DeepSeek folosește API-ul său compatibil OpenAI la `https://api.deepseek.com/chat/completions`,
cu `response_format: {"type":"json_object"}` și `thinking: {"type":"disabled"}` pentru extragerea criteriilor. JSON-ul rezultat este verificat prin Zod,
iar componentele sunt selectate doar din CSV. Erorile, răspunsurile incomplete și
cerințele incompatibile nu generează produse inventate. Limitările zilnice sunt per proces,
nu reprezintă un plafon financiar global. Păstrați și o limită de buget în contul furnizorului.

Pentru teste fără chei: `npm test` și `npm run test:browser` (după instalarea Chromium).
Verificarea live DeepSeek necesită credit/cheie validă. Modul anterior
`SEARCH_MODE=openai` rămâne disponibil, fără modificarea catalogului sau a căutării.

[Modelele și endpoint-ul DeepSeek](https://api-docs.deepseek.com/) · [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/) ·
[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/).

## Configurarea modurilor

| Variabilă în `backend/.env` | Valoare implicită | Efect |
| --- | --- | --- |
| `SEARCH_MODE` | `demo` | `demo` folosește reguli locale. `deepseek` folosește Chat Completions cu JSON Output, iar `openai` păstrează Responses API. Un mod necunoscut oprește pornirea. |
| `DEEPSEEK_API_KEY` | goală | Cheie privată DeepSeek în modul `deepseek`. |
| `DEEPSEEK_MODEL` | `deepseek-flash` | Model DeepSeek configurabil. |
| `DEEPSEEK_DAILY_REQUEST_LIMIT`, `DEEPSEEK_MAX_CONCURRENT` | `100`, `2` | Limite per proces pentru apelurile DeepSeek. |
| `OPENAI_API_KEY` | goală | Cheie citită exclusiv de procesul backend în modul OpenAI. |
| `OPENAI_MODEL` | `gpt-5.4-mini` | Poate fi înlocuit cu un model disponibil contului care acceptă Responses API și Structured Outputs. |
| `OPENAI_DAILY_REQUEST_LIMIT` | `100` | Numărul maxim de încercări OpenAI într-o zi UTC, per proces. Valoarea 0 oprește apelurile externe. |
| `OPENAI_MAX_CONCURRENT` | `2` | Numărul maxim de apeluri simultane, per proces. Trebuie să fie un întreg pozitiv. |
| `HOST`, `PORT` | `127.0.0.1`, `3000` | Interfața și portul HTTP. |
| `FRONTEND_ORIGINS` | goală | Lista originilor suplimentare, separate prin virgulă. Fiecare origine include schema, gazda și portul dacă este necesar. |

`interpreter_ready` indică existența configurației locale. Disponibilitatea furnizorului și creditul se pot confirma doar printr-o cerere live autorizată. Interfața afișează modul configurat și semnalează explicit deciziile locale.

## Fluxul unei căutări

1. Scriptul comun `js/main.js` încarcă `js/ai-search.js` pe pagina principală și în magazin. Acesta conectează câmpul existent din antet și adaugă sub navigare formularul mobil și o zonă proprie de rezultate. Trimite întrebarea și, dacă este selectat, grupul de categorii din antet. Valorile din catalog sunt afișate prin `textContent`.
2. `src/app.js` verifică tipul, dimensiunea și forma cererii, originea browserului și limita de frecvență. Servirea de fișiere este limitată la paginile și directoarele publice ale site-ului.
3. `src/query-guards.js` și `src/demo.js` verifică mai întâi dacă filtrele pot reprezenta cererea. Pentru întrebările care necesită modelul, `src/interpret.js` trimite întrebarea ca mesaj de utilizator prin SDK-ul oficial. În modul DeepSeek se folosește Chat Completions cu JSON și validare locală. Modul OpenAI opțional folosește `responses.parse` cu `store: false`. Limitele sunt de 2.000 de tokeni de ieșire, 15 secunde și zero reîncercări automate. Modelul nu primește catalogul și nu are instrumente sau acces la comenzi. `src/demo.js` implementează interpretarea locală.
4. `src/criteria.js` validează tipurile, valorile, relația dintre categorie și unități și câmpurile permise. Un plafon în lei nu poate deveni un plafon în USD prin interpretarea modelului.
5. `src/catalog-data.js` citește CSV-urile, normalizează valorile și furnizează înregistrări cu sursă identificabilă. `src/search.js` aplică filtrele obligatorii, apoi ordonează după marca preferată și apropierea de pragul minim. Egalitățile păstrează ordinea catalogului. Textul explicațiilor provine din regulile serverului.
6. Pentru un PC complet sau o întrebare de compatibilitate, răspunsul include criteriile și verificările lipsă. Utilizarea și rezoluția rămân disponibile unui viitor configurator.

În modul demo, o cerere în română poate include marcă, familie/model recunoscut, nuclee, memorie, DDR, număr de module, wați, utilizare și buget. Capacitatea fără „minimum” este exactă. Pentru CPU sau sursă, numărul simplu de nuclee sau wați reprezintă un prag inferior. Toate modurile cer clarificări atunci când identifică o excludere, alternative de mărci sau categorii, un interval, un plafon hardware ori un atribut fără filtru. Rezultatele rămân goale până la reformulare. „GPU fără NVIDIA”, „GPU MSI sau ASUS”, „RAM de maximum 16 GB” și „CPU cu TDP de 65 W” sunt exemple. „GPU sub 300 USD” aplică o limită strictă, iar „cel mult 300 USD” include suma de 300 USD. Un buget în lei, EUR sau fără monedă nu este convertit și se rezolvă local.

Pentru o decizie locală în modul DeepSeek sau OpenAI, API-ul trimite `interpretation_source: "validation"`, iar interfața precizează că nu a fost apelat modelul. Parserul demonstrativ și răspunsurile interpretate de model au sursele `demo`, `deepseek` și `openai`. În cazul unei clarificări cu motiv identificabil, `clarification_reason` oferă un cod stabil, de exemplu `negative`, `multiple_brands` sau `unsupported_bound`. Modelul trebuie să declare separat cerințele nereprezentabile. Serverul cere clarificări dacă lista conține cel puțin o cerință. Regulile locale acoperă tipare în principal în română și engleză. Formulările libere rămân dependente de interpretarea modelului.

Eșecurile furnizorului și timeout-urile contează în plafonul zilnic, deoarece cererea a plecat deja. Căutările demonstrative, clarificările locale, cererile invalide și refuzurile de capacitate nu consumă acest plafon. Toate limitele de cost sunt per proces, în memorie. Repornirea resetează contoarele, iar instanțele multiple ar necesita o cotă comună. Pentru un plafon financiar trebuie luate în calcul modelul și tarifele sale.

## Endpoint-uri

| Metodă și cale | Intrare | Răspuns |
| --- | --- | --- |
| `GET /api/ai/health` | Fără parametri | `200`. Exemplu: `{"status":"ok","mode":"demo","interpreter_ready":true}`. În modurile cu furnizor, indicatorul verifică prezența configurației locale, fără apel facturabil. |
| `POST /api/ai/search` | `Content-Type: application/json`, `query` de 3–500 de caractere și `scope` opțional, maximum 4 KiB pe corp | `200` cu `mode`, `interpretation_source`, `criteria`, `total`, maximum 8 `products`, `messages` și `suggestions`. Solicitările de configurare adaugă `configuration`. Lipsa potrivirilor întoarce `200` și lista goală. |
| `GET /api/ai/products` | Filtrele și paginarea de mai jos | `200` cu `total`, `page`, `page_size`, `products` și `messages`. O pagină peste ultima disponibilă este goală. |

Pe serverul Node sunt disponibile și aliasurile `/api/health` și `/api/products`. Când FastAPI deservește magazinul, direcționează numai `/api/ai/*` spre Node. `scope` acceptă `cpu_gpu`, `board_ram`, `storage_psu`, `build` sau `service`. O contradicție cere clarificare. Selecția de service trimite clientul către Contact.

`GET /api/ai/products` acceptă `category` (`cpu`, `gpu`, `ram`, `motherboard`, `psu`, `case`, `cooler`, `storage`), `brand` obligatorie ca potrivire dacă este dată, `family`, `budget_max` și `currency`. Pentru filtrele tehnice `min_cores`, `min_memory_gb`, `memory_gb`, `ddr_generation`, `module_count`, `min_wattage_w` trebuie specificată categoria. `page` pornește de la 1 (maximum 1.000.000), `page_size` are valoarea implicită 20 și maximum 50. Parametrii necunoscuți sau repetați sunt respinși. Monedele acceptate de schemă sunt `USD`, `RON`, `EUR`, `GBP` și `other`. Numai un plafon USD poate fi comparat cu prețuri USD verificate.

```sh
curl http://127.0.0.1:3000/api/ai/health
curl -X POST http://127.0.0.1:3000/api/ai/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"Vreau o placă video NVIDIA cu minimum 12 GB VRAM pentru editare video."}'
curl 'http://127.0.0.1:3000/api/ai/products?category=gpu&brand=NVIDIA&min_memory_gb=12&page=1&page_size=1'
```

Exemplu de răspuns integral la ultimul GET, pentru instantaneul documentat al catalogului:

```json
{
  "total": 992, "page": 1, "page_size": 1,
  "products": [{
    "id": "gpu-1", "category": "gpu", "name": "MSI GeForce RTX 3060 Ventus 2X 12G", "manufacturer": "MSI",
    "specs": { "chipset": "GeForce RTX 3060 12GB", "chipset_vendor": "NVIDIA", "memory_gb": 12, "base_mhz": 1320, "boost_mhz": 1777, "length_mm": 235 },
    "price": { "amount": 299.97, "currency": "USD", "dataset_date": "2025-07-23", "kind": "historical" },
    "source": { "file": "video-card.csv", "record": 1 }
  }],
  "messages": []
}
```

Pentru POST-ul de mai sus, `total` este tot 992, iar primul rezultat are explicația „Placă video · Marcă solicitată: NVIDIA · 12 GB VRAM”. Obiectul `criteria` din răspuns este:

```json
{
  "intent": "component_search", "category": "gpu", "brand": "NVIDIA", "brand_policy": "required",
  "family": null, "min_cores": null, "min_memory_gb": 12, "memory_gb": null, "module_count": null,
  "ddr_generation": null, "min_wattage_w": null, "budget_max": null, "budget_exclusive": false,
  "currency": null, "usage": "video_editing", "resolution": null
}
```

| Cerere în română | Comportament în modul demo, cu catalogul verificat |
| --- | --- |
| Caut un procesor AMD Ryzen pentru gaming, cu minimum 6 nuclee. | 71 de potriviri. Primul este AMD Ryzen 5 7600X, cu 6 nuclee. |
| Vreau o placă video NVIDIA cu minimum 12 GB VRAM pentru editare video. | 992 de potriviri. Proiectantul chipsetului și producătorul plăcii sunt câmpuri distincte. |
| Am nevoie de 32 GB RAM DDR5 pentru un PC de gaming. | 1.340 de potriviri pentru exact 32 GB, DDR5. Primul kit este Corsair Vengeance RGB 32 GB, 2 × 16 GB. |
| Vreau un PC de gaming de maximum 5000 lei, pentru 1440p, prefer AMD. | `build_request`, `budget_max: 5000`, `currency: "RON"`, marcă preferată AMD. Lista de produse este goală, iar `configuration.required_checks` conține verificările încă necesare. |
| GPU NVIDIA cu buget de 900 lei | Lista de produse este goală. Utilizatorul poate reformula explicit folosind USD sau eliminând plafonul. |

### Erori și limite

| HTTP | Cod JSON | Când apare |
| --- | --- | --- |
| 400 | `invalid_input` | JSON invalid, chei suplimentare, input nevalid, combinație categorie/filtru invalidă. |
| 403 | `origin_denied` | Originea browserului nu este autorizată. |
| 404 | `not_found` | Rută API necunoscută. |
| 413 / 415 | `body_too_large` / `unsupported_media_type` | Corpul depășește 4 KiB sau formatul/codificarea nu este acceptat(ă). |
| 429 | `rate_limited` | Limita locală per IP este de 12 căutări sau 90 listări pe minut. Consultă `Retry-After`. |
| 429 | `llm_daily_limit` / `llm_busy` | Plafonul zilnic sau cel de apeluri simultane este atins. Valoarea numerică din `Retry-After` este în secunde. |
| 502 | `llm_invalid_response` | Refuz, răspuns incomplet, schemă invalidă ori contradicție privind un buget sau un filtru explicit recunoscut. |
| 503 | `deepseek_not_configured` / `openai_not_configured` / `llm_unavailable` | Cheie absentă, credit insuficient sau furnizor indisponibil. |
| 504 | `llm_timeout` | Timeout la furnizor. |
| 500 | `internal_error` | Eroare neașteptată, fără detalii interne în răspuns. |

Exemplu pentru o căutare cu `SEARCH_MODE=deepseek` și cheia absentă.

```json
{"mode":"deepseek","error":{"code":"deepseek_not_configured","message":"Modul DeepSeek necesită o cheie configurată pe server."}}
```

### Frontend și backend pe gazde diferite

GitHub Pages servește HTML, CSS și JavaScript. Pentru a folosi căutarea online, publică aplicația Node și catalogul pe o gazdă HTTPS care acceptă procese persistente. Păstrează structura proiectului, instalează dependențele cu `npm ci --omit=dev` în `backend/`, configurează `HOST=0.0.0.0` și portul dat de platformă, apoi pornește `npm start` în același director. Configurează `DEEPSEEK_API_KEY` ca secret și limitele zilnice și de concurență în mediul serverului.

Dacă folosești același domeniu, un reverse proxy poate trimite `/api/ai/*` către Node și rutele comerciale către serviciul magazinului. Pentru un frontend static pe alt domeniu, adaugă în `<head>` din `index.html` și `shop.html`:

```html
<meta name="overclock-api-origin" content="https://api.exemplu.ro">
```

Înlocuiește adresa demonstrativă cu originea reală și setează `FRONTEND_ORIGINS` la originea exactă a frontend-ului, fără cale (de exemplu `https://vasibestia.github.io`). Verifică `GET /api/ai/health` și o căutare demonstrativă din browser înainte să activezi modul facturabil. Limitele în memorie și limita per IP folosesc un singur proces și IP-ul conexiunii. În spatele unui proxy sau pe mai multe instanțe configurează accesul, adresele proxy de încredere și o cotă persistentă comună înainte de folosirea publică facturabilă.

### Teste

```sh
cd backend
npm ci
npm test
npx playwright install --only-shell chromium
npm run test:browser
```

Setează `CHROMIUM_PATH` pentru a folosi un Chromium existent. Testele pornesc Express, folosesc CSV-urile și izolează transportul furnizorilor. Copiile jQuery și Bootstrap pentru teste sunt instalate prin `npm ci` la versiunile din HTML. Chromium verifică și erorile JavaScript, navigarea și coșul.

Pentru cele două teste suplimentare cu pagina și CSS-ul reale din `interface`, din rădăcina proiectului:

```sh
git fetch https://github.com/VasiBestia/OverClock_Store.git interface
git worktree add --detach ../overclock-interface 71f2ab1fe6a63cc18411a16d23453c201434c897
cd backend
OVERCLOCK_INTERFACE_ROOT=../../overclock-interface npm run test:browser
```

În PowerShell setează `$env:OVERCLOCK_INTERFACE_ROOT='../../overclock-interface'` înainte de comanda npm. GitHub Actions citește aceleași două fișiere la commit-ul fixat, folosește Node 24 și rulează ambele suite la PR către `main`, după integrare pe `main` și la push pe branch-urile de dezvoltare indicate în [workflow](../.github/workflows/backend-tests.yml). În scenariul de compatibilitate, FastAPI returnează o listă simulată pentru grila magazinului. Cererile AI parcurg backend-ul Node și catalogul real.

### Înlocuirea catalogului și integrarea ulterioară

Adaptorul curent furnizează `list(category)`. Un adaptor pentru SQL sau API poate încărca aceleași obiecte `{id, category, name, manufacturer, specs, price, source}` la pornire și poate fi transmis în `createApp({repository, ...})`. Păstrează câmpurile lipsă ca `null`. Pentru un catalog mare, mută filtrele, ordonarea și paginarea în adaptor, cu aceleași teste de contract. Prețurile comerciale necesită o sursă datată și o monedă confirmată, iar stocul necesită o sursă de inventar. Un configurator are nevoie de reguli și surse suplimentare pentru BIOS, socketuri, RAM, conectori și spațiu fizic. [Inventarul și proveniența datelor](CATALOG.md).

### Relația cu serviciul SQL al echipei

La revizia `interface` din 26 noiembrie 2026 (`71f2ab1`), `database/populare.py` importă CSV-urile în SQL Server. Scripturile SQL leagă tabelele de componente, `products`, categorii, socketuri și formate. Importul atribuie unor rânduri stocul 15 și calculează RON cu un coeficient fix de 4,65. Aceste valori sunt date de demonstrație. Căutarea citește catalogul CSV acceptat în `main` și afișează numai prețuri istorice cu proveniență verificată.

`Logica_AI.py` expune FastAPI pentru categorii, produse și `/api/configure-pc`. Folosește interogări SQL, bugete pe categorii și câteva reguli de socket, RAM și format de carcasă. Nu interpretează limbaj natural. În acel branch, grila magazinului cere `http://127.0.0.1:8000/api/products?limit=8` și așteaptă o listă. Căutarea folosește exclusiv `/api/ai/*` și propria zonă de rezultate. Pentru publicarea redesignului, echipa trebuie să configureze adresa reală a catalogului și disponibilitatea SQL. Pentru certificarea unei configurații complete rămân necesare date despre BIOS, conectori, consum și spațiile fizice.

Documentația OpenAI acoperă schema strictă și modelul configurat. [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) · [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)

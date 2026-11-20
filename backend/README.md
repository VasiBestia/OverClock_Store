# Căutare hardware

Aplicația pornește în modul demonstrativ și citește catalogul local o singură dată. Node.js 22.12 sau mai nou și npm sunt necesare. Din rădăcina clonei fork-ului, pe branch-ul `feature/ai-search-llm-mvp`, rulează:

```sh
cd backend
npm ci
cp .env.example .env
npm start
```

În PowerShell, comanda de copiere este `Copy-Item .env.example .env`. Deschide [pagina principală](http://127.0.0.1:3000/) sau [magazinul](http://127.0.0.1:3000/shop.html). Câmpul de căutare se află în antet pe desktop și sub navigare pe mobil.

## DeepSeek API (nou)

Modul `demo` nu necesită cheie și nu trimite cereri la furnizori. Pentru căutare prin DeepSeek:

1. Creează o cheie privată în [platforma DeepSeek](https://platform.deepseek.com/api_keys).
2. Creează local `backend/.env` plecând de la `backend/.env.example`.
3. Introdu `SEARCH_MODE=deepseek`, `DEEPSEEK_API_KEY=...` și `DEEPSEEK_MODEL=deepseek-flash`.
4. Rulează `npm start` și deschide `http://127.0.0.1:3000/shop.html`.
5. Testează „GPU NVIDIA minimum 12 GB VRAM” și verifică `interpretation_source: "deepseek"` în răspunsul API. Unele cereri sunt validate local și nu consumă un apel LLM.

**Atenție:** folosește cheia numai în backend, niciodată în HTML/JS public sau într-un commit Git.
DeepSeek folosește API-ul său compatibil OpenAI la `https://api.deepseek.com/chat/completions`,
cu `response_format: {"type":"json_object"}`. JSON-ul rezultat este verificat prin Zod,
iar componentele sunt selectate doar din CSV. Erorile, răspunsurile incomplete și
cerințele incompatibile nu generează produse inventate. Limitările zilnice sunt per proces,
nu reprezintă un plafon financiar global. Păstrați și o limită de buget în contul furnizorului.

Pentru teste fără chei: `npm test` și `npm run test:browser` (după instalarea Chromium).
Verificarea live DeepSeek necesită credit/cheie validă. Modul anterior
`SEARCH_MODE=openai` rămâne disponibil, fără modificarea catalogului sau a căutării.

Documentație: [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/) ·
[Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/).

## Configurarea modurilor

| Variabilă în `backend/.env` | Valoare implicită | Efect |
| --- | --- | --- |
| `SEARCH_MODE` | `demo` | `demo` folosește reguli locale. `deepseek` folosește Chat Completions cu JSON Output, iar `openai` păstrează Responses API. Un mod necunoscut oprește pornirea. |
| `DEEPSEEK_API_KEY` | goală | Cheie privată DeepSeek în modul `deepseek`. |\n| `DEEPSEEK_MODEL` | `deepseek-flash` | Model DeepSeek configurabil. |\n| `DEEPSEEK_DAILY_REQUEST_LIMIT`, `DEEPSEEK_MAX_CONCURRENT` | `100`, `2` | Limite per proces pentru apelurile DeepSeek. |\n| `OPENAI_API_KEY` | goală | Cheie citită exclusiv de procesul backend în modul OpenAI. |
| `OPENAI_MODEL` | `gpt-5.4-mini` | Poate fi înlocuit cu un model disponibil contului care acceptă Responses API și Structured Outputs. |
| `OPENAI_DAILY_REQUEST_LIMIT` | `100` | Numărul maxim de încercări OpenAI într-o zi UTC, per proces. Valoarea 0 oprește apelurile externe. |
| `OPENAI_MAX_CONCURRENT` | `2` | Numărul maxim de apeluri simultane, per proces. Trebuie să fie un întreg pozitiv. |
| `HOST`, `PORT` | `127.0.0.1`, `3000` | Interfața și portul HTTP. |
| `FRONTEND_ORIGINS` | goală | Lista originilor suplimentare, separate prin virgulă. Fiecare origine include schema, gazda și portul dacă este necesar. |

Pentru o cerere reală, setează `SEARCH_MODE=openai` și cheia **în fișierul local** `backend/.env`, apoi repornește procesul. Cererile reale pot consuma credit din contul OpenAI. Testele folosesc transport simulat. Modul OpenAI întoarce o eroare explicită în caz de refuz, răspuns incomplet, indisponibilitate sau cheie lipsă. Interfața afișează modul activ.

## Fluxul unei căutări

1. Formularul din `index.html` sau `shop.html` trimite doar întrebarea la backend. `js/ai-search.js` construiește elemente DOM și scrie valorile prin `textContent`.
2. `src/app.js` verifică tipul, dimensiunea și forma cererii, originea browserului și limita de frecvență. Servirea de fișiere este limitată la paginile și directoarele publice ale site-ului.
3. `src/query-guards.js` și `src/demo.js` verifică mai întâi dacă filtrele pot reprezenta cererea. Pentru întrebările care necesită modelul, `src/interpret.js` trimite întrebarea ca mesaj de utilizator prin SDK-ul oficial. `responses.parse` primește o schemă strictă, cu `store: false`, o limită de ieșire, timeout de 15 secunde și zero reîncercări automate. Modelul nu primește catalogul și nu are instrumente sau acces la comenzi. `src/demo.js` implementează interpretarea locală.
4. `src/criteria.js` validează tipurile, valorile, relația dintre categorie și unități și câmpurile permise. Un plafon în lei nu poate deveni un plafon în USD prin interpretarea modelului.
5. `src/catalog-data.js` citește CSV-urile, normalizează valorile și furnizează înregistrări cu sursă identificabilă. `src/search.js` aplică filtrele obligatorii, apoi ordonează după marca preferată și apropierea de pragul minim. Egalitățile păstrează ordinea catalogului. Textul explicațiilor provine din regulile serverului.
6. Pentru un PC complet sau o întrebare de compatibilitate, răspunsul include criteriile și verificările lipsă. Utilizarea și rezoluția rămân disponibile unui viitor configurator.

În modul demo, o cerere în română poate include marcă, familie/model recunoscut, nuclee, memorie, DDR, număr de module, wați, utilizare și buget. Capacitatea fără „minimum” este exactă. Pentru CPU sau sursă, numărul simplu de nuclee sau wați reprezintă un prag inferior. Ambele moduri cer clarificări atunci când identifică o excludere, alternative de mărci sau categorii, un interval, un plafon hardware ori un atribut fără filtru. Rezultatele rămân goale până la reformulare. „GPU fără NVIDIA”, „GPU MSI sau ASUS”, „RAM de maximum 16 GB” și „CPU cu TDP de 65 W” sunt exemple. „GPU sub 300 USD” aplică o limită strictă, iar „cel mult 300 USD” include suma de 300 USD. Un buget în lei, EUR sau fără monedă nu este convertit și nu consumă un apel OpenAI.

Pentru o decizie locală în modul OpenAI, API-ul trimite `interpretation_source: "validation"`, iar interfața precizează că nu a fost apelat modelul. Parserul demonstrativ și răspunsurile interpretate de model au sursele `demo` și `openai`. În cazul unei clarificări cu motiv identificabil, `clarification_reason` oferă un cod stabil, de exemplu `negative`, `multiple_brands` sau `unsupported_bound`. Modelul trebuie să declare separat cerințele nereprezentabile. Serverul cere clarificări dacă lista conține cel puțin o cerință. Regulile locale acoperă tipare în principal în română și engleză. Formulările libere rămân dependente de interpretarea modelului.

Eșecurile furnizorului și timeout-urile contează în plafonul zilnic, deoarece cererea a plecat deja. Căutările demonstrative, clarificările locale, cererile invalide și refuzurile de capacitate nu consumă acest plafon. Toate limitele de cost sunt per proces, în memorie. Repornirea resetează contoarele, iar instanțele multiple ar necesita o cotă comună. Pentru un plafon financiar trebuie luate în calcul modelul și tarifele sale.

## Endpoint-uri

| Metodă și cale | Intrare | Răspuns |
| --- | --- | --- |
| `GET /api/health` | Fără parametri | `200`. Exemplu: `{"status":"ok","mode":"demo","interpreter_ready":true}`. În modul OpenAI, indicatorul verifică prezența configurației locale, fără apel facturabil. |
| `POST /api/ai/search` | `Content-Type: application/json`, obiect cu un singur câmp `query`, 3–500 de caractere, maximum 4 KiB pe corp | `200` cu `mode`, `interpretation_source`, `criteria`, `total`, maximum 8 `products`, `messages` și `suggestions`. Solicitările de configurare adaugă `configuration`. Lipsa potrivirilor întoarce `200` și lista goală. |
| `GET /api/products` | Filtrele și paginarea de mai jos | `200` cu `total`, `page`, `page_size`, `products` și `messages`. O pagină peste ultima disponibilă este goală. |

`GET /api/products` acceptă `category` (`cpu`, `gpu`, `ram`, `motherboard`, `psu`, `case`, `cooler`, `storage`), `brand` obligatorie ca potrivire dacă este dată, `family`, `budget_max` și `currency`. Pentru filtrele tehnice `min_cores`, `min_memory_gb`, `memory_gb`, `ddr_generation`, `module_count`, `min_wattage_w` trebuie specificată categoria. `page` pornește de la 1 (maximum 1.000.000), `page_size` are valoarea implicită 20 și maximum 50. Parametrii necunoscuți sau repetați sunt respinși. Monedele acceptate de schemă sunt `USD`, `RON`, `EUR`, `GBP` și `other`. Numai un plafon USD poate fi comparat cu prețuri USD verificate.

```sh
curl http://127.0.0.1:3000/api/health
curl -X POST http://127.0.0.1:3000/api/ai/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"Vreau o placă video NVIDIA cu minimum 12 GB VRAM pentru editare video."}'
curl 'http://127.0.0.1:3000/api/products?category=gpu&brand=NVIDIA&min_memory_gb=12&page=1&page_size=1'
```

Exemplu de răspuns integral la ultimul GET, pentru versiunea de catalog din fork:

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
| 503 | `openai_not_configured` / `llm_unavailable` | Cheie locală lipsă sau serviciu OpenAI indisponibil, inclusiv autorizare/cotă. |
| 504 | `llm_timeout` | Timeout OpenAI. |
| 500 | `internal_error` | Eroare neașteptată, fără detalii interne în răspuns. |

Exemplu la căutare cu `SEARCH_MODE=openai` și cheie absentă:

```json
{"mode":"openai","error":{"code":"openai_not_configured","message":"Modul OpenAI necesită o cheie configurată pe server."}}
```

### Frontend și backend pe gazde diferite

GitHub Pages servește fișiere statice. Rulează procesul Node pe o gazdă care îl acceptă. Pe ambele pagini, completează `<meta name="overclock-api-origin" content="https://api.exemplu.ro">` cu originea HTTPS a backend-ului. Pe backend setează `FRONTEND_ORIGINS=https://vlad20405.github.io` pentru publicarea frontend-ului sub acel cont. Originea nu include calea proiectului. La aceeași origine, lasă câmpul meta gol. Un reverse proxy HTTPS poate cere adăugarea originii publice în lista permisă. Limitele sunt păstrate în memoria unui singur proces și folosesc IP-ul conexiunii. Pentru mai multe instanțe, folosește un limiter partajat și configurează explicit proxy-urile de încredere. CORS controlează accesul browserelor. Pentru un backend LLM public cu costuri, aplică și politica de acces și buget a magazinului.

### Teste

```sh
cd backend  # dacă te afli în rădăcina proiectului
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Workflow-ul [Backend tests](../.github/workflows/backend-tests.yml) rulează `npm ci` și `npm test` în `backend/` pe Node 24, la push pe branch-ul MVP și la un viitor PR către `main`. Are permisiunea `contents: read`, nu solicită secrete și rulează în modul demo. Suita Chromium se poate rula local prin comanda de mai sus.

Testele Node acoperă parserul, normalizarea, unitățile, preferințele, bugetele, limitele HTTP și erorile. Testul SDK parcurge serializarea și deserializarea reale, cu un transport HTTP simulat. Suita Chromium pornește un server local demonstrativ pe un port liber. Verifică desktop, mobil, rezultate și erori, afișarea sigură a textului, navigarea și butoanele coșului. Folosește `CHROMIUM_PATH` pentru un executabil deja instalat. Testul de regresie al site-ului folosește versiunile jQuery și Bootstrap din HTML. Pentru execuție fără acces la CDN, setează `OVERCLOCK_TEST_ASSETS` la un director cu cele două fișiere originale `jquery.min.js` (3.6.4) și `bootstrap.bundle.min.js` (5.0.0).

### Înlocuirea catalogului și integrarea ulterioară

Adaptorul curent furnizează `list(category)`. Un adaptor pentru SQL sau API poate încărca aceleași obiecte `{id, category, name, manufacturer, specs, price, source}` la pornire și poate fi transmis în `createApp({repository, ...})`. Păstrează câmpurile lipsă ca `null`. Pentru un catalog mare, mută filtrele, ordonarea și paginarea în adaptor, cu aceleași teste de contract. Prețurile comerciale necesită o sursă datată și o monedă confirmată, iar stocul necesită o sursă de inventar. Un configurator are nevoie de reguli și surse suplimentare pentru BIOS, socketuri, RAM, conectori și spațiu fizic. [Inventarul și proveniența datelor](CATALOG.md).

Pentru integrarea în proiectul echipei, revizuiți diferența dintre branch-ul din fork și `main` al proiectului original, rulați ambele suite și decideți unde rulează backend-ul. Deschiderea unui PR către proiectul original și merge-ul rămân operațiuni distincte, la aprobarea echipei.

Documentația OpenAI acoperă schema strictă și modelul configurat. [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) · [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)

# OverClock Store

Magazinul include căutare de componente în limbaj natural în pagina principală și în magazin. MVP-ul folosește catalogul CSV al proiectului. Modul demonstrativ funcționează local, fără cheie OpenAI.

```sh
git clone --branch feature/ai-search-llm-mvp --single-branch https://github.com/Vlad20405/OverClock_Store.git
cd OverClock_Store/backend
npm ci
cp .env.example .env
npm start
```

Folosește Node.js 22.12 sau mai nou. Deschide [magazinul local](http://127.0.0.1:3000/shop.html) și încearcă „Am nevoie de 32 GB RAM DDR5 pentru un PC de gaming”. Testele backend se execută cu `npm test` din directorul `backend`. Instrucțiunile pentru modul OpenAI, testele în browser și conectarea unui frontend static sunt în [ghidul backend și API](backend/README.md). Vezi și [proveniența prețurilor și limitele catalogului](backend/CATALOG.md).

## DeepSeek API

Căutarea funcționează fără API în modul `demo`. Pentru interpretare prin DeepSeek,
configurează *numai local*, în `backend/.env`:

```dotenv
SEARCH_MODE=deepseek
DEEPSEEK_API_KEY=cheia_ta_privata
DEEPSEEK_MODEL=deepseek-flash
```

Pornește `cd backend && npm ci && npm start`. Cheia API trebuie păstrată exclusiv în
backend; `.env` este ignorat de Git. Pentru limitări și teste vezi [ghidul backend](backend/README.md).

## Șablonul original

# Salone - Free Bootstrap 5 Business Template 

- [Demo](https://themewagon.github.io/Electro-Bootstrap/)

#### Download

- [Download from ThemeWagon](https://themewagon.com/themes/electro-bootstrap/)

## Getting Started

Clone Repository

```
https://github.com/themewagon/Electro-Bootstrap.git
```

## Author

```
Salone is developed by Team HTML Codex.
```

## License

- Design and Code is Copyright &copy; [HTML Codex](https://htmlcodex.com/).
- Licensed cover under [MIT]
- Distributed by [ThemeWagon](https://themewagon.com)

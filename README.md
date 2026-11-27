# OverClock Store

Pe pagina principală și în magazin poți căuta componente în română. De exemplu, „Vreau o placă video NVIDIA cu minimum 12 GB VRAM”. Serverul filtrează cele opt categorii din catalogul CSV și explică fiecare potrivire.

## Pornire locală

Cu Node.js 22.12 sau mai nou și npm, dintr-un terminal:

```sh
git clone https://github.com/VasiBestia/OverClock_Store.git
cd OverClock_Store/backend
npm ci
cp .env.example .env
npm start
```

Deschide [magazinul local](http://127.0.0.1:3000/shop.html). Modul implicit `demo` funcționează fără cheie. Pentru DeepSeek, setează `SEARCH_MODE=deepseek` și `DEEPSEEK_MODEL=deepseek-flash` în `backend/.env`, configurează `DEEPSEEK_API_KEY` exclusiv pe server și repornește procesul. La găzduire, cheia se configurează ca secret al platformei. Testele automate folosesc transport simulat și se rulează cu `npm test` și `npm run test:browser`.

[Ghidul API, teste și găzduire](backend/README.md) · [Catalogul și proveniența prețurilor istorice](backend/CATALOG.md)

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

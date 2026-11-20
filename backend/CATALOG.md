# Catalogul hardware

Branch-ul folosește fișierele din `pc-part-dataset/` la commit-ul de bază `85de2004c4f77b7decdb5433f8eba61986e36f63`. Analiza celor 25 de CSV-uri a identificat 63.332 de rânduri de date, 47.315 prețuri lipsă și zero duplicate de rând integral după curățarea proiectului. Există denumiri repetate pentru variante distincte. De exemplu, cele 12.595 de rânduri RAM au 3.493 de denumiri distincte. Identificatorul returnat de API combină categoria cu numărul înregistrării din versiunea curentă. `source.record` începe la 1 după antet și nu este un SKU comercial persistent.

## Proveniența și moneda

Am comparat obiectele Git ale celor 25 de CSV-uri importate la commit-ul `fdc59ca28e74d96e02a1d6086e97a4180e5618c1` cu fișierele `data/csv/` din `docyx/pc-part-dataset` la commit-ul `c52a04ca9465c83997ed335f7767b09a2005dd26`. Toate cele 25 de fișiere importate au conținut identic cu omoloagele lor. După curățarea făcută de echipă, fiecare pereche nevidă `(name, price)` din fiecare fișier curent există în fișierul corespunzător importat. Sursa atribuie datele PCPartPicker, documentează USD și declară ultima actualizare la **23 iulie 2025**. Data descrie instantaneul sursei. [Sursa datelor](https://github.com/docyx/pc-part-dataset/tree/c52a04ca9465c83997ed335f7767b09a2005dd26) · [Unități și monedă](https://github.com/docyx/pc-part-dataset/blob/c52a04ca9465c83997ed335f7767b09a2005dd26/API.md)

Adaptorul verifică amprenta SHA-256 a fiecărui fișier indexat înainte să asocieze prețurilor moneda și data de mai sus. Verificarea normalizează BOM-ul UTF-8 și terminatorii CRLF. Un fișier cu date modificate rămâne căutabil, cu `currency: null` și `dataset_date: null` până la verificarea provenienței. O celulă de preț goală produce `price: null`. Interfața arată doar sumele cu monedă confirmată. Câmpurile actuale nu conțin inventar, data verificării unei oferte sau prețuri de vânzare OverClock. Filtrele în lei nu declanșează conversii. Căutarea cu plafon USD exclude rândurile fără preț USD verificat.

## Cele opt categorii indexate

| Categorie / CSV | Rânduri | Fără preț | Coloane în afară de `name` și `price` | Interpretare |
| --- | ---: | ---: | --- | --- |
| CPU · `cpu.csv` | 961 | 469 | `core_count, core_clock, boost_clock, microarchitecture, tdp, graphics` | Nuclee, GHz, GHz și TDP în W. Boost lipsește la 445 de rânduri. Socketul nu apare. |
| GPU · `video-card.csv` | 6.547 | 5.277 | `chipset, memory, core_clock, boost_clock, color, length` | VRAM în GB, frecvențe în MHz și lungime în mm. Lungime lipsă la 660 de rânduri. Proiectantul GPU se identifică din familia chipsetului, separat de marca plăcii. |
| RAM · `memory.csv` | 12.595 | 9.712 | `speed, modules, price_per_gb, color, first_word_latency, cas_latency` | `"5,6000"` codifică DDR5 și viteza declarată 6000 (MHz în documentația sursei). `"2,16"` înseamnă două module × 16 GB. Latența inițială este în ns. |
| Plăci de bază · `motherboard.csv` | 4.972 | 4.021 | `socket, form_factor, max_memory, memory_slots, color` | Socket, format, memorie maximă în GB, număr de sloturi. Lipsesc generația DDR și lista de CPU/BIOS acceptate. |
| Surse · `power-supply.csv` | 3.364 | 2.798 | `type, efficiency, wattage, modular, color` | Format și putere în W. Eficiența lipsește la 400 de rânduri. Conectorii nu sunt inventariați. |
| Carcase · `case.csv` | 6.428 | 5.380 | `type, color, psu, side_panel, external_volume, internal_35_bays` | Tip, puterea sursei incluse în W dacă e dată, volum în L și număr de locașuri de 3,5″. Volumul nu stabilește spațiul disponibil pentru GPU. |
| Coolere · `cpu-cooler.csv` | 2.827 | 1.885 | `rpm, noise_level, color, size` | RPM, zgomot în dB și dimensiune radiator în mm. Turația și zgomotul pot fi intervale între ghilimele. Dimensiunea radiatorului lipsește la 1.543 de rânduri. |
| Stocare internă · `internal-hard-drive.csv` | 5.955 | 3.867 | `capacity, price_per_gb, type, cache, form_factor, interface` | Capacitate în GB, cache în MB. `type` poate fi SSD, turația unui HDD sau valoare lipsă. 1 TB de stocare = 1.000 GB. |

Cele opt categorii au **43.649 de înregistrări**, dintre care 10.240 au preț istoric verificat. Normalizarea lasă valorile absente ca `null`, respectă virgulele din câmpurile între ghilimele și respinge conversiile numerice parțiale. Filtrele tehnice obligatorii exclud înregistrările cu date insuficiente. Producătorii identificați din denumire folosesc o listă de prefixe cunoscute. O marcă neidentificată se păstrează ca `null`. În filtrarea explicită se poate verifica și prefixul literal al denumirii.

## Celelalte fișiere inspectate

| Fișier CSV | Rânduri | Fără preț | Fișier CSV | Rânduri | Fără preț |
| --- | ---: | ---: | --- | ---: | ---: |
| case-accessory | 8 | 8 | case-fan | 2.537 | 1.557 |
| external-hard-drive | 643 | 340 | fan-controller | 54 | 45 |
| headphones | 2.897 | 2.240 | keyboard | 3.716 | 2.911 |
| monitor | 4.933 | 3.596 | mouse | 2.741 | 1.906 |
| optical-drive | 231 | 203 | os | 50 | 39 |
| sound-card | 76 | 64 | speakers | 301 | 177 |
| thermal-paste | 203 | 102 | ups | 701 | 399 |
| webcam | 71 | 19 | wired-network-card | 157 | 73 |
| wireless-network-card | 364 | 227 | | | |

Aceste 17 categorii pot fi adăugate prin extinderea adaptorului, a schemei și a testelor pentru unitățile specifice. De exemplu, monitorul codifică rezoluția în două dimensiuni, UPS-ul distinge wați și volt-amperi, iar stocarea externă are capacitate și interfață. SKU-urile, ofertele actuale și benchmark-urile ar necesita surse suplimentare.

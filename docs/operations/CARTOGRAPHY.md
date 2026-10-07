# Cartografia, mapas e navegação

- **OSM** é o projeto/dado OpenStreetMap. **OsmAnd** é um aplicativo Android de navegação separado; não é renderer web nem sinônimo de OSM.
- Mapas embutidos usam **Leaflet 1.9.4** e tiles raster `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, com attribution visível. Não há segunda biblioteca de renderer. Leaflet é CDN e tiles são rede pública; nenhum é precacheado.
- Geocoding/busca e reverse geocoding usam Nominatim público em ações explícitas. Texto de endereço pode ser enviado ao serviço; não há geocoder self-hosted. Revisar privacidade/volume antes de operação em escala.
- No HEAD, Motoboy não chama serviço de routing público nem atualiza distância/tempo operacional. Route e valores vêm do Restaurante pela sync. OSRM permanece boundary backend configurável do Restaurante para cálculo viário e falha como `unavailable`; não substitui por haversine.
- Navegação externa escolhida pelo usuário/preferência persistente do aparelho suporta OsmAnd, Google Maps e Waze. Os links contêm somente coordenadas validadas. Busca externa via botão Google também requer pino confirmado e envia somente coordenadas. Navegação não é autoridade para Route, custo, ETA, GPS ou tracking.
- Offline: IndexedDB/telas e operações já locais permanecem; mapas web podem ficar vazios/incompletos sem CDN/tiles. GPS depende de permissão e hardware. OsmAnd só funciona offline se instalado e com mapa baixado pelo usuário. Chromium não valida intent físico Android. Sync retorna ao reconectar; localização publicada pode aguardar rede.

## Superfícies auditadas

Rotas/preview, tela de trabalho e acompanhamento, mapa do formulário/seleção de destino, localização/GPS, marcadores/foco e navegação por parada usam o mesmo Leaflet/OSM. Mapa não grava estado operacional quando tiles falham; Route, entrega e custo são dados locais/sincronizados separados.

A baseline estável já usava Leaflet e OSM, mas fazia routing por endpoints públicos (`router.project-osrm.org` e `routing.openstreetmap.de`). Esses requests foram removidos do cliente. Não se instala OSRM nem dataset neste ciclo.

## Referências oficiais

- [Política dos tiles OSM](https://operations.osmfoundation.org/policies/tiles/)
- [Política Nominatim](https://operations.osmfoundation.org/policies/nominatim/)
- [Licença OSM/ODbL](https://osmfoundation.org/wiki/Licence)
- [OsmAnd intents](https://www.osmand.net/docs/technical/algorithms/osmand-intents/)

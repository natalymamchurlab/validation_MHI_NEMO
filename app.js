// Инициализация карты
let map;
let markers = [];
let buoyData = {};

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: {lat: 43.5, lng: 34.5}, // Центр Черного моря
        zoom: 6,
        mapTypeId: 'hybrid'
    });
    
    // Загрузка данных
    loadBuoyData();
}

// Загрузка данных ARGO/NEMO
async function loadBuoyData() {
    try {
        const response = await fetch('data/buoy_data.json');
        buoyData = await response.json();
        initBuoySelect();
        plotBuoyTracks();
    } catch (error) {
        console.error('Error loading buoy data:', error);
    }
}

// Инициализация выбора буев
function initBuoySelect() {
    const select = document.getElementById('buoy-select');
    const buoyIds = Object.keys(buoyData);
    
    select.innerHTML = '';
    buoyIds.forEach(id => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `Буй ${id}`;
        select.appendChild(option);
    });
    
    // Инициализация выбора глубины
    initDepthSelect(buoyIds[0]);
}

// Инициализация выбора глубины
function initDepthSelect(buoyId) {
    const select = document.getElementById('depth-select');
    const depths = [...new Set(buoyData[buoyId].map(d => d.zM))].sort((a, b) => a - b);
    
    select.innerHTML = '';
    depths.forEach(depth => {
        const option = document.createElement('option');
        option.value = depth;
        option.textContent = `${depth} м`;
        select.appendChild(option);
    });
}

// Отображение треков буев на карте
function plotBuoyTracks() {
    // Очистка предыдущих маркеров
    markers.forEach(marker => marker.setMap(null));
    markers = [];
    
    Object.keys(buoyData).forEach(buoyId => {
        const positions = buoyData[buoyId].map(d => ({
            lat: d.latA,
            lng: d.lonA,
            date: new Date(d.timeM),
            depth: d.zM,
            tM: d.tM,
            tA: d.tA
        }));
        
        // Линия трека
        const path = new google.maps.Polyline({
            path: positions.map(p => ({lat: p.lat, lng: p.lng})),
            geodesic: true,
            strokeColor: '#FF0000',
            strokeOpacity: 1.0,
            strokeWeight: 2,
            map: map
        });
        
        // Маркеры для каждой точки
        positions.forEach(pos => {
            const marker = new google.maps.Marker({
                position: {lat: pos.lat, lng: pos.lng},
                map: map,
                title: `Буй ${buoyId}\nДата: ${pos.date.toLocaleDateString()}\nГлубина: ${pos.depth} м`,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 6,
                    fillColor: getColorForTempDiff(pos.tM - pos.tA),
                    fillOpacity: 1,
                    strokeWeight: 1,
                    strokeColor: '#ffffff'
                }
            });
            
            // Обработчик клика на маркере
            marker.addListener('click', () => {
                updatePlots(buoyId, pos.date, pos.depth);
            });
            
            markers.push(marker);
        });
    });
}

// Цвет маркера в зависимости от разницы температур
function getColorForTempDiff(diff) {
    if (diff > 2) return '#ff0000'; // Красный
    if (diff > 1) return '#ff6600'; // Оранжевый
    if (diff > 0.5) return '#ffcc00'; // Желтый
    if (diff > -0.5) return '#00cc00'; // Зеленый
    if (diff > -1) return '#0066ff'; // Голубой
    if (diff > -2) return '#0000ff'; // Синий
    return '#9900cc'; // Фиолетовый
}

// Обновление графиков
function updatePlots(buoyId, date, depth) {
    // Фильтрация данных по бую, дате и глубине
    const filteredData = buoyData[buoyId].filter(d => 
        new Date(d.timeM).toDateString() === date.toDateString() && 
        Math.abs(d.zM - depth) < 0.1
    );
    
    if (filteredData.length === 0) return;
    
    // Построение профилей температуры
    plotTempProfile(filteredData, buoyId, date);
    
    // Построение временного ряда для выбранной глубины
    plotTimeSeries(buoyId, depth);
}

// Построение профилей температуры
function plotTempProfile(data, buoyId, date) {
    const depths = data.map(d => d.zM);
    const tM = data.map(d => d.tM);
    const tA = data.map(d => d.tA);
    
    const trace1 = {
        x: tM,
        y: depths,
        name: 'NEMO',
        mode: 'lines+markers',
        line: {color: 'red'},
        marker: {size: 8}
    };
    
    const trace2 = {
        x: tA,
        y: depths,
        name: 'ARGO',
        mode: 'lines+markers',
        line: {color: 'blue', dash: 'dash'},
        marker: {size: 8}
    };
    
    const layout = {
        title: `Профили температуры для буя ${buoyId} (${date.toLocaleDateString()})`,
        xaxis: {title: 'Температура (°C)'},
        yaxis: {title: 'Глубина (м)', autorange: 'reversed'},
        showlegend: true
    };
    
    Plotly.newPlot('temp-profile-plot', [trace1, trace2], layout);
    
    // Построение аномалий
    const anomalies = tM.map((t, i) => t - tA[i]);
    const anomalyTrace = {
        x: anomalies,
        y: depths,
        name: 'Аномалия (NEMO - ARGO)',
        mode: 'lines+markers',
        line: {color: 'black'},
        marker: {size: 8}
    };
    
    const anomalyLayout = {
        title: `Аномалии температуры для буя ${buoyId}`,
        xaxis: {title: 'Аномалия температуры (°C)'},
        yaxis: {title: 'Глубина (м)', autorange: 'reversed'},
        shapes: [{
            type: 'line',
            x0: 0,
            x1: 0,
            y0: Math.min(...depths),
            y1: Math.max(...depths),
            line: {color: 'gray', dash: 'dot'}
        }],
        showlegend: true
    };
    
    Plotly.newPlot('anomaly-plot', [anomalyTrace], anomalyLayout);
}

// Построение временного ряда
function plotTimeSeries(buoyId, depth) {
    const buoyDataFiltered = buoyData[buoyId].filter(d => Math.abs(d.zM - depth) < 0.1);
    
    const dates = buoyDataFiltered.map(d => new Date(d.timeM));
    const tM = buoyDataFiltered.map(d => d.tM);
    const tA = buoyDataFiltered.map(d => d.tA);
    
    const trace1 = {
        x: dates,
        y: tM,
        name: 'NEMO',
        mode: 'lines+markers',
        line: {color: 'red'},
        marker: {size: 8}
    };
    
    const trace2 = {
        x: dates,
        y: tA,
        name: 'ARGO',
        mode: 'lines+markers',
        line: {color: 'blue', dash: 'dash'},
        marker: {size: 8}
    };
    
    const layout = {
        title: `Температура на глубине ${depth} м для буя ${buoyId}`,
        xaxis: {title: 'Дата'},
        yaxis: {title: 'Температура (°C)'},
        showlegend: true
    };
    
    Plotly.newPlot('time-series-plot', [trace1, trace2], layout);
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    // Инициализация выбора даты
    $('#date-range').daterangepicker({
        opens: 'left',
        locale: {
            format: 'YYYY-MM-DD',
            applyLabel: 'Применить',
            cancelLabel: 'Отмена',
            fromLabel: 'От',
            toLabel: 'До',
            customRangeLabel: 'Произвольный',
            daysOfWeek: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
            monthNames: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
            firstDay: 1
        }
    });
    
    // Обработчик изменения буя
    document.getElementById('buoy-select').addEventListener('change', function() {
        initDepthSelect(this.value);
    });
    
    // Обработчик кнопки обновления
    document.getElementById('update-btn').addEventListener('click', function() {
        const buoyId = document.getElementById('buoy-select').value;
        const dateRange = document.getElementById('date-range').value.split(' - ');
        const depth = parseFloat(document.getElementById('depth-select').value);
        
        // Фильтрация данных по выбранным параметрам
        const startDate = new Date(dateRange[0]);
        const endDate = new Date(dateRange[1]);
        
        const filteredData = buoyData[buoyId].filter(d => 
            new Date(d.timeM) >= startDate && 
            new Date(d.timeM) <= endDate && 
            Math.abs(d.zM - depth) < 0.1
        );
        
        if (filteredData.length > 0) {
            updatePlots(buoyId, new Date(filteredData[0].timeM), depth);
        }
    });
});
const Gantt = (function() {
    const WORK_START_MINUTE = 480;
    const WORK_END_MINUTE = 1080;
    const TOTAL_WORK_MINUTES = WORK_END_MINUTE - WORK_START_MINUTE;
    const SNAP_MINUTES = 15;

    let dragState = {
        isDragging: false,
        orderId: null,
        startX: 0,
        startY: 0,
        originalLine: null,
        originalStart: null,
        currentLine: null,
        currentStart: null,
        element: null
    };

    function init() {
        renderTimeRuler();
        setupDragAndDrop();
    }

    function renderTimeRuler() {
        const ruler = document.getElementById('timeRuler');
        ruler.innerHTML = '';
        
        const hours = 10;
        for (let i = 0; i <= hours; i++) {
            const marker = document.createElement('div');
            marker.className = 'time-marker';
            const hour = 8 + i;
            marker.style.left = `${(i / hours) * 100}%`;
            marker.textContent = `${hour.toString().padStart(2, '0')}:00`;
            ruler.appendChild(marker);
        }
    }

    function render() {
        renderTrack('trackA', 'lineA');
        renderTrack('trackB', 'lineB');
        renderTrack('trackC', 'lineC');
        renderUnscheduledList();
        updateStats();
    }

    function renderTrack(trackId, lineId) {
        const track = document.getElementById(trackId);
        track.innerHTML = '';
        
        const orders = Store.getOrdersByLine(lineId);
        
        orders.forEach(order => {
            const bar = createGanttBar(order, lineId);
            track.appendChild(bar);
        });
    }

    function createGanttBar(order, lineId) {
        const bar = document.createElement('div');
        bar.className = `gantt-bar ${lineId}`;
        bar.dataset.orderId = order.id;
        bar.dataset.lineId = lineId;
        bar.draggable = true;
        
        const isOverdue = Utils.isOverdue(order.dueDate);
        if (isOverdue) {
            bar.classList.add('overdue');
        }
        
        const leftPercent = ((order.startMinute - WORK_START_MINUTE) / TOTAL_WORK_MINUTES) * 100;
        const widthPercent = (order.stdMinutes / TOTAL_WORK_MINUTES) * 100;
        
        bar.style.left = `${leftPercent}%`;
        bar.style.width = `${widthPercent}%`;
        
        bar.innerHTML = `
            <div class="bar-content">
                <div class="bar-model">${order.productModel}</div>
                <div class="bar-time">${Utils.formatMinutes(order.startMinute)} - ${Utils.formatMinutes(order.startMinute + order.stdMinutes)}</div>
            </div>
            <div class="bar-delete" title="删除工单">×</div>
        `;
        
        bar.querySelector('.bar-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`确定删除工单 ${order.productModel} 吗？`)) {
                Store.deleteWorkOrder(order.id);
                render();
                Utils.showToast('工单已删除', 'success');
            }
        });
        
        return bar;
    }

    function renderUnscheduledList() {
        const list = document.getElementById('unscheduledList');
        const orders = Store.getUnscheduledOrders();
        
        document.getElementById('unscheduledCount').textContent = orders.length;
        
        if (orders.length === 0) {
            list.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <span>暂无待排程工单</span>
                </div>
            `;
            return;
        }
        
        list.innerHTML = '';
        orders.forEach(order => {
            const card = document.createElement('div');
            card.className = 'order-card';
            card.dataset.orderId = order.id;
            card.draggable = true;
            
            const isOverdue = Utils.isOverdue(order.dueDate);
            
            card.innerHTML = `
                <div class="order-card-header">
                    <span class="order-model">${order.productModel}</span>
                    <span class="order-qty">×${order.quantity}</span>
                </div>
                <div class="order-card-footer">
                    <span class="order-time">${order.stdMinutes}分钟</span>
                    <span class="order-due ${isOverdue ? 'overdue' : ''}">${Utils.formatDate(order.dueDate)}</span>
                </div>
            `;
            
            card.addEventListener('dragstart', handleUnscheduledDragStart);
            card.addEventListener('dragend', handleDragEnd);
            
            card.addEventListener('dblclick', () => {
                if (confirm(`确定删除工单 ${order.productModel} 吗？`)) {
                    Store.deleteWorkOrder(order.id);
                    render();
                    Utils.showToast('工单已删除', 'success');
                }
            });
            
            list.appendChild(card);
        });
    }

    function updateStats() {
        const total = Store.getWorkOrders().length;
        const overdue = Store.getOverdueCount();
        const avgLoad = Store.getAvgLoad();
        
        document.getElementById('totalOrders').textContent = total;
        document.getElementById('overdueOrders').textContent = overdue;
        document.getElementById('avgLoad').textContent = `${avgLoad.toFixed(0)}%`;
        
        ['lineA', 'lineB', 'lineC'].forEach((lineId, index) => {
            const load = Store.getLineLoad(lineId);
            const loadEl = document.getElementById(`loadLine${['A', 'B', 'C'][index]}`);
            const fillEl = document.getElementById(`loadFill${['A', 'B', 'C'][index]}`);
            
            loadEl.textContent = `${load.toFixed(0)}%`;
            fillEl.style.width = `${load}%`;
            
            fillEl.classList.remove('load-warning', 'load-danger');
            if (load >= 90) {
                fillEl.classList.add('load-danger');
            } else if (load >= 70) {
                fillEl.classList.add('load-warning');
            }
        });
    }

    function setupDragAndDrop() {
        const tracks = document.querySelectorAll('.gantt-track');
        
        tracks.forEach(track => {
            track.addEventListener('dragover', handleTrackDragOver);
            track.addEventListener('drop', handleTrackDrop);
            track.addEventListener('dragleave', handleTrackDragLeave);
        });
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    function handleUnscheduledDragStart(e) {
        const orderId = e.currentTarget.dataset.orderId;
        e.dataTransfer.setData('orderId', orderId);
        e.dataTransfer.setData('source', 'unscheduled');
        e.currentTarget.classList.add('dragging');
    }

    function handleTrackDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add('drag-over');
    }

    function handleTrackDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    }

    function handleTrackDrop(e) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');
        
        const orderId = e.dataTransfer.getData('orderId');
        const source = e.dataTransfer.getData('source');
        const lineId = e.currentTarget.dataset.line;
        
        if (!orderId) return;
        
        const order = Store.getWorkOrderById(orderId);
        if (!order) return;
        
        const trackRect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - trackRect.left;
        const percent = x / trackRect.width;
        let startMinute = WORK_START_MINUTE + percent * TOTAL_WORK_MINUTES;
        startMinute = Utils.roundToNearest(startMinute, SNAP_MINUTES);
        startMinute = Utils.clamp(startMinute, WORK_START_MINUTE, WORK_END_MINUTE - order.stdMinutes);
        
        if (Store.hasConflict(orderId, lineId, startMinute, order.stdMinutes)) {
            Utils.showToast('时间冲突，无法放置', 'error');
            return;
        }
        
        Store.updateWorkOrder(orderId, {
            lineId: lineId,
            startMinute: startMinute
        });
        
        render();
        Utils.showToast('工单已安排', 'success');
    }

    function handleDragEnd(e) {
        e.currentTarget.classList.remove('dragging');
        
        document.querySelectorAll('.gantt-track').forEach(track => {
            track.classList.remove('drag-over');
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        setupGanttBarDrag();
    });

    function setupGanttBarDrag() {
        document.addEventListener('mousedown', (e) => {
            const bar = e.target.closest('.gantt-bar');
            if (!bar || e.target.classList.contains('bar-delete')) return;
            
            e.preventDefault();
            const orderId = bar.dataset.orderId;
            const order = Store.getWorkOrderById(orderId);
            if (!order) return;
            
            const track = bar.parentElement;
            const trackRect = track.getBoundingClientRect();
            
            dragState = {
                isDragging: true,
                orderId: orderId,
                startX: e.clientX,
                startY: e.clientY,
                originalLine: order.lineId,
                originalStart: order.startMinute,
                currentLine: order.lineId,
                currentStart: order.startMinute,
                element: bar,
                trackWidth: trackRect.width,
                trackRect: trackRect
            };
            
            bar.classList.add('dragging');
            
            const minutesPerPixel = TOTAL_WORK_MINUTES / trackRect.width;
            dragState.minutesPerPixel = minutesPerPixel;
        });
    }

    function handleMouseMove(e) {
        if (!dragState.isDragging) return;
        
        const bar = dragState.element;
        const order = Store.getWorkOrderById(dragState.orderId);
        if (!bar || !order) return;
        
        const deltaX = e.clientX - dragState.startX;
        const deltaMinutes = deltaX * dragState.minutesPerPixel;
        
        let newStart = dragState.originalStart + deltaMinutes;
        newStart = Utils.roundToNearest(newStart, SNAP_MINUTES);
        newStart = Utils.clamp(newStart, WORK_START_MINUTE, WORK_END_MINUTE - order.stdMinutes);
        
        const tracks = document.querySelectorAll('.gantt-track');
        let newLine = dragState.originalLine;
        
        tracks.forEach(track => {
            const rect = track.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
                newLine = track.dataset.line;
            }
        });
        
        dragState.currentLine = newLine;
        dragState.currentStart = newStart;
        
        const leftPercent = ((newStart - WORK_START_MINUTE) / TOTAL_WORK_MINUTES) * 100;
        bar.style.left = `${leftPercent}%`;
        
        const hasConflict = Store.hasConflict(dragState.orderId, newLine, newStart, order.stdMinutes);
        if (hasConflict) {
            bar.classList.add('conflict');
        } else {
            bar.classList.remove('conflict');
        }
    }

    function handleMouseUp(e) {
        if (!dragState.isDragging) return;
        
        const bar = dragState.element;
        const order = Store.getWorkOrderById(dragState.orderId);
        
        if (bar && order) {
            bar.classList.remove('dragging');
            bar.classList.remove('conflict');
            
            const hasConflict = Store.hasConflict(dragState.orderId, dragState.currentLine, dragState.currentStart, order.stdMinutes);
            
            if (!hasConflict) {
                Store.updateWorkOrder(dragState.orderId, {
                    lineId: dragState.currentLine,
                    startMinute: dragState.currentStart
                });
            } else {
                Utils.showToast('时间冲突，已恢复原位', 'warning');
            }
        }
        
        dragState.isDragging = false;
        dragState.element = null;
        dragState.orderId = null;
        
        render();
    }

    function getSnapMinutes() {
        return SNAP_MINUTES;
    }

    function getWorkStartTime() {
        return WORK_START_MINUTE;
    }

    function getWorkEndTime() {
        return WORK_END_MINUTE;
    }

    return {
        init,
        render,
        getSnapMinutes,
        getWorkStartTime,
        getWorkEndTime
    };
})();

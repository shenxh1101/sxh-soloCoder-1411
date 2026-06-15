const Gantt = (function() {
    let WORK_START_MINUTE = 480;
    let WORK_END_MINUTE = 1080;
    let WORK_MINUTES_PER_DAY = 600;
    const MINUTES_PER_DAY = 1440;
    const SNAP_MINUTES = 15;
    
    const DISPLAY_DAYS = 7;
    
    let config = {
        timeScale: 60,
        displayDays: DISPLAY_DAYS,
        showHistorical: true
    };

    let dragState = {
        isDragging: false,
        orderId: null,
        startX: 0,
        startY: 0,
        originalLine: null,
        originalStart: null,
        originalDay: null,
        currentLine: null,
        currentStart: null,
        currentDay: null,
        element: null
    };

    function init() {
        updateCalendarSettings();
        renderTimeRuler();
        setupDragAndDrop();
    }

    function updateCalendarSettings() {
        const calendar = Store.getCalendar();
        if (calendar) {
            WORK_START_MINUTE = Store.getWorkStartTime();
            WORK_END_MINUTE = Store.getWorkEndTime();
            WORK_MINUTES_PER_DAY = Store.getAvailableMinutesPerDay();
        }
    }

    function getTimeScale() {
        return config.timeScale;
    }

    function setTimeScale(minutes) {
        config.timeScale = minutes;
        renderTimeRuler();
        render();
    }

    function setShowHistorical(show) {
        config.showHistorical = show;
        render();
    }

    function getDisplayDays() {
        return config.displayDays;
    }

    function getWorkDaysToDisplay() {
        const workDays = [];
        let currentDate = new Date();
        let daysFound = 0;
        
        while (daysFound < config.displayDays) {
            if (Store.isWorkDay(currentDate) && !Store.isDowntime(currentDate)) {
                workDays.push(new Date(currentDate));
                daysFound++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return workDays;
    }

    function getDisplayDayIndex(dayOffset) {
        const workDays = getWorkDaysToDisplay();
        return Math.min(dayOffset, workDays.length - 1);
    }

    function getTotalDisplayMinutes() {
        return config.displayDays * WORK_MINUTES_PER_DAY;
    }

    function minuteToAbsolute(minuteOfDay, dayOffset) {
        return dayOffset * MINUTES_PER_DAY + minuteOfDay;
    }

    function absoluteToMinuteAndDay(absoluteMinute) {
        const dayOffset = Math.floor(absoluteMinute / MINUTES_PER_DAY);
        const minuteOfDay = absoluteMinute % MINUTES_PER_DAY;
        return { minuteOfDay, dayOffset };
    }

    function getDisplayPosition(startMinute, dayOffset) {
        const displayIndex = getDisplayDayIndex(dayOffset);
        const relativeMinutes = displayIndex * WORK_MINUTES_PER_DAY + (startMinute - WORK_START_MINUTE);
        return (relativeMinutes / getTotalDisplayMinutes()) * 100;
    }

    function positionToAbsolute(percent, trackWidth, clientX, trackLeft) {
        const relativeMinutes = (percent / 100) * getTotalDisplayMinutes();
        const displayIndex = Math.floor(relativeMinutes / WORK_MINUTES_PER_DAY);
        const minutesInDay = relativeMinutes % WORK_MINUTES_PER_DAY;
        let startMinute = WORK_START_MINUTE + minutesInDay;
        
        if (Store.isInBreakTime(startMinute) || !Store.isInAnyShift(startMinute)) {
            const nextAvail = Store.findNextAvailableMinute(new Date(), startMinute, 1);
            if (nextAvail) {
                startMinute = nextAvail.minute;
            }
        }
        
        const workDays = getWorkDaysToDisplay();
        const actualDate = workDays[Math.min(displayIndex, workDays.length - 1)];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dayOffset = Math.floor((actualDate - today) / (1000 * 60 * 60 * 24));
        
        return { startMinute, dayOffset };
    }

    function renderTimeRuler() {
        updateCalendarSettings();
        const ruler = document.getElementById('timeRuler');
        ruler.innerHTML = '';
        
        const totalMinutes = getTotalDisplayMinutes();
        const interval = config.timeScale;
        const workDays = getWorkDaysToDisplay();
        
        workDays.forEach((date, displayIndex) => {
            const dayStartPercent = (displayIndex * WORK_MINUTES_PER_DAY / totalMinutes) * 100;
            const dayWidthPercent = (WORK_MINUTES_PER_DAY / totalMinutes) * 100;
            
            const dayLabel = document.createElement('div');
            dayLabel.className = 'day-label';
            dayLabel.style.left = `${dayStartPercent}%`;
            dayLabel.style.width = `${dayWidthPercent}%`;
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const compareDate = new Date(date);
            compareDate.setHours(0, 0, 0, 0);
            const diffDays = Math.floor((compareDate - today) / (1000 * 60 * 60 * 24));
            
            let dayName;
            if (diffDays === 0) dayName = '今天';
            else if (diffDays === 1) dayName = '明天';
            else if (diffDays === 2) dayName = '后天';
            else dayName = `${date.getMonth() + 1}/${date.getDate()}`;
            
            dayLabel.innerHTML = `
                <div class="day-name">${dayName}</div>
                <div class="day-date">${date.getMonth() + 1}/${date.getDate()} 周${'日一二三四五六'[date.getDay()]}</div>
            `;
            ruler.appendChild(dayLabel);
            
            const shifts = Store.getShifts();
            shifts.forEach(shift => {
                const shiftStartPercent = dayStartPercent + ((shift.startMinute - WORK_START_MINUTE) / WORK_MINUTES_PER_DAY * dayWidthPercent);
                const shiftWidthPercent = ((shift.endMinute - shift.startMinute) / WORK_MINUTES_PER_DAY * dayWidthPercent);
                
                if (shiftWidthPercent > 0) {
                    const shiftMarker = document.createElement('div');
                    shiftMarker.className = 'shift-marker';
                    shiftMarker.style.left = `${shiftStartPercent}%`;
                    shiftMarker.style.width = `${shiftWidthPercent}%`;
                    shiftMarker.title = shift.name;
                    ruler.appendChild(shiftMarker);
                }
            });
            
            const calendar = Store.getCalendar();
            calendar.breakPeriods.forEach(bp => {
                const breakStartPercent = dayStartPercent + ((bp.startMinute - WORK_START_MINUTE) / WORK_MINUTES_PER_DAY * dayWidthPercent);
                const breakWidthPercent = ((bp.endMinute - bp.startMinute) / WORK_MINUTES_PER_DAY * dayWidthPercent);
                
                if (breakWidthPercent > 0 && bp.startMinute >= WORK_START_MINUTE && bp.endMinute <= WORK_END_MINUTE) {
                    const breakMarker = document.createElement('div');
                    breakMarker.className = 'break-marker';
                    breakMarker.style.left = `${breakStartPercent}%`;
                    breakMarker.style.width = `${breakWidthPercent}%`;
                    breakMarker.title = bp.name || '休息';
                    ruler.appendChild(breakMarker);
                }
            });
            
            const intervalsPerDay = Math.floor(WORK_MINUTES_PER_DAY / interval);
            for (let i = 0; i <= intervalsPerDay; i++) {
                const marker = document.createElement('div');
                marker.className = 'time-marker';
                
                const minutesFromStart = displayIndex * WORK_MINUTES_PER_DAY + i * interval;
                const percent = (minutesFromStart / totalMinutes) * 100;
                marker.style.left = `${percent}%`;
                
                const actualMinute = calculateActualMinuteForMarker(displayIndex, i * interval);
                const hour = Math.floor(actualMinute / 60);
                const minute = actualMinute % 60;
                marker.textContent = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                
                if (minute % 60 === 0) {
                    marker.classList.add('hour-marker');
                }
                
                ruler.appendChild(marker);
            }
        });
    }

    function calculateActualMinuteForMarker(dayIndex, offsetMinutes) {
        const shifts = Store.getShifts();
        const calendar = Store.getCalendar();
        let currentMinute = WORK_START_MINUTE + offsetMinutes;
        
        for (const bp of calendar.breakPeriods) {
            if (currentMinute >= bp.startMinute) {
                currentMinute += (bp.endMinute - bp.startMinute);
            }
        }
        
        return currentMinute;
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
        
        const orders = Store.getOrdersByLine(lineId, config.showHistorical);
        
        orders.forEach(order => {
            const segments = createOrderSegments(order);
            segments.forEach((segment, segIndex) => {
                const bar = createGanttBar(order, lineId, segment, segIndex, segments.length);
                track.appendChild(bar);
            });
        });
    }

    function createOrderSegments(order) {
        const calendar = Store.getCalendar();
        if (!order.segments || order.segments.length === 0) {
            if (order.stdMinutes > WORK_MINUTES_PER_DAY || 
                (order.startMinute && (order.startMinute + order.stdMinutes) > WORK_END_MINUTE)) {
                return Store.splitOrderForMultiDay(order, order.lineId, order.startMinute, order.dayOffset || 0);
            }
            return [{
                dayOffset: order.dayOffset || 0,
                startMinute: order.startMinute,
                duration: order.stdMinutes,
                endMinute: order.startMinute + order.stdMinutes
            }];
        }
        return order.segments;
    }

    function createGanttBar(order, lineId, segment, segIndex, totalSegments) {
        const bar = document.createElement('div');
        bar.className = `gantt-bar ${lineId}`;
        bar.dataset.orderId = order.id;
        bar.dataset.lineId = lineId;
        bar.dataset.segIndex = segIndex;
        bar.draggable = segIndex === 0;
        
        const status = order.status || 'scheduled';
        bar.classList.add(`status-${status}`);
        
        if (status === 'completed' || status === 'cancelled') {
            bar.classList.add('historical');
        }
        
        const statusColor = Store.STATUS_COLORS[status];
        if (statusColor && status !== 'scheduled') {
            bar.style.background = statusColor;
            bar.style.borderColor = statusColor;
        }
        
        const isOverdue = Utils.isOverdue(order.dueDate) && 
            status !== 'completed' && status !== 'cancelled';
        if (isOverdue) {
            bar.classList.add('overdue');
        }
        
        const dayOffset = segment.dayOffset;
        const leftPercent = getDisplayPosition(segment.startMinute, dayOffset);
        const widthPercent = (segment.duration / getTotalDisplayMinutes()) * 100;
        
        bar.style.left = `${leftPercent}%`;
        bar.style.width = `${widthPercent}%`;
        
        const isFirstSegment = segIndex === 0;
        const isLastSegment = segIndex === totalSegments - 1;
        
        if (totalSegments > 1) {
            if (!isFirstSegment) {
                bar.classList.add('segment-continued');
            }
            if (!isLastSegment) {
                bar.classList.add('segment-continuing');
            }
        }
        
        const execution = Store.getExecutionData(order.id);
        const statusLabel = Store.STATUS_LABELS[status] || '';
        const timeLabel = `${Utils.formatMinutes(segment.startMinute)} - ${Utils.formatMinutes(segment.endMinute)}`;
        
        let segmentLabel = '';
        if (totalSegments > 1) {
            if (isFirstSegment) {
                segmentLabel = `<div class="bar-segment">↓ 跨天 ${totalSegments}段</div>`;
            } else {
                segmentLabel = `<div class="bar-segment">↑ 续上段</div>`;
            }
        }
        
        const dayLabel = dayOffset > 0 ? `<div class="bar-day">Day ${dayOffset + 1}</div>` : '';
        const statusBadge = status !== 'scheduled' ? `<div class="bar-status">${statusLabel}</div>` : '';
        
        let progressBar = '';
        if (status === 'in_progress' && execution.progress > 0 && isLastSegment) {
            progressBar = `
                <div class="bar-progress">
                    <div class="bar-progress-fill" style="width: ${execution.progress}%"></div>
                    <span class="bar-progress-text">${execution.progress}%</span>
                </div>
            `;
        }
        
        const isHistorical = status === 'completed' || status === 'cancelled';
        const canEdit = !isHistorical;
        
        let actionButtons = '';
        if (isLastSegment) {
            actionButtons = `
                <div class="bar-actions">
                    ${!isHistorical && status === 'scheduled' ? `
                        <button class="bar-action-btn start-btn" title="开始生产" data-action="start">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                        </button>
                    ` : ''}
                    ${!isHistorical && status === 'in_progress' ? `
                        <button class="bar-action-btn complete-btn" title="完成生产" data-action="complete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </button>
                    ` : ''}
                    <button class="bar-action-btn status-btn" title="切换状态" data-action="status">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </button>
                    ${canEdit ? `
                        <button class="bar-action-btn delete-btn" title="删除工单" data-action="delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    ` : ''}
                </div>
            `;
        }
        
        bar.innerHTML = `
            <div class="bar-content">
                <div class="bar-model">${order.productModel}</div>
                <div class="bar-time">${timeLabel}</div>
                ${dayLabel}
                ${statusBadge}
                ${progressBar}
                ${segmentLabel}
                ${actionButtons}
            </div>
        `;
        
        const actionBtns = bar.querySelectorAll('.bar-action-btn');
        actionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                handleBarAction(order, action, e);
            });
        });
        
        bar.addEventListener('click', (e) => {
            if (!dragState.isDragging && !e.target.closest('.bar-action-btn')) {
                if (canEdit) {
                    App.openEditModal(order.id);
                } else {
                    App.openExecutionModal(order.id);
                }
            }
        });
        
        if (isFirstSegment && canEdit) {
            bar.addEventListener('mousedown', (e) => {
                if (!e.target.closest('.bar-action-btn')) {
                    handleBarMouseDown(e, bar, order, segment);
                }
            });
        }
        
        return bar;
    }

    function handleBarAction(order, action, event) {
        switch (action) {
            case 'start':
                if (confirm(`确定要开始生产工单「${order.productModel}」吗？`)) {
                    Store.startWork(order.id);
                    render();
                    Utils.showToast(`工单已开始生产`, 'success');
                }
                break;
            case 'complete':
                const exec = Store.getExecutionData(order.id);
                const actualQty = prompt('请输入实际完成数量：', order.quantity.toString());
                if (actualQty !== null) {
                    const qty = parseInt(actualQty) || order.quantity;
                    Store.completeWork(order.id, qty);
                    render();
                    Utils.showToast(`工单已完成，共${qty}件`, 'success');
                }
                break;
            case 'status':
                showStatusMenu(order, event);
                break;
            case 'delete':
                if (confirm(`确定删除工单 ${order.productModel} 吗？`)) {
                    Store.deleteWorkOrder(order.id);
                    render();
                    Utils.showToast('工单已删除', 'success');
                }
                break;
        }
    }

    function showStatusMenu(order, event) {
        const existingMenu = document.querySelector('.status-menu');
        if (existingMenu) existingMenu.remove();
        
        const menu = document.createElement('div');
        menu.className = 'status-menu active';
        
        const statuses = [
            { value: 'pending', label: '待排程', color: Store.STATUS_COLORS.pending, action: null },
            { value: 'scheduled', label: '已排程', color: Store.STATUS_COLORS.scheduled, action: null },
            { value: 'in_progress', label: '已开工', color: Store.STATUS_COLORS.in_progress, action: 'start' },
            { value: 'completed', label: '已完成', color: Store.STATUS_COLORS.completed, action: 'complete' },
            { value: 'cancelled', label: '已取消', color: Store.STATUS_COLORS.cancelled, action: 'cancel' }
        ];
        
        statuses.forEach(s => {
            const item = document.createElement('div');
            item.className = 'status-menu-item';
            item.innerHTML = `
                <span class="status-dot" style="background: ${s.color}"></span>
                <span>${s.label}</span>
                ${order.status === s.value ? '<span class="status-check">✓</span>' : ''}
            `;
            item.addEventListener('click', () => {
                if (s.action === 'start') {
                    Store.startWork(order.id);
                } else if (s.action === 'complete') {
                    Store.completeWork(order.id);
                } else if (s.action === 'cancel') {
                    const reason = prompt('请输入取消原因：', '');
                    if (reason !== null) {
                        Store.cancelWork(order.id, reason);
                    } else {
                        menu.remove();
                        return;
                    }
                } else {
                    Store.updateOrderStatus(order.id, s.value);
                }
                render();
                Utils.showToast(`工单状态已更新为「${s.label}」`, 'success');
                menu.remove();
            });
            menu.appendChild(item);
        });
        
        document.body.appendChild(menu);
        
        const rect = event.target.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY + 5}px`;
        menu.style.left = `${rect.left + window.scrollX}px`;
        
        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 0);
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
            const statusColor = Store.STATUS_COLORS[order.status] || '#ff9500';
            
            card.innerHTML = `
                <div class="order-card-header">
                    <span class="order-model">${order.productModel}</span>
                    <span class="order-qty">×${order.quantity}</span>
                </div>
                <div class="order-card-footer">
                    <span class="order-time">${order.stdMinutes}分钟</span>
                    <span class="order-due ${isOverdue ? 'overdue' : ''}">${Utils.formatDate(order.dueDate)}</span>
                </div>
                <div class="order-card-status" style="background: ${statusColor}">
                    ${Store.STATUS_LABELS[order.status] || '待排程'}
                </div>
            `;
            
            card.addEventListener('dragstart', handleUnscheduledDragStart);
            card.addEventListener('dragend', handleDragEnd);
            
            card.addEventListener('click', () => {
                App.openEditModal(order.id);
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
        
        const execStats = Store.getExecutionStats();
        const inProgressEl = document.getElementById('inProgressCount');
        const completedTodayEl = document.getElementById('completedTodayCount');
        const avgProgressEl = document.getElementById('avgProgress');
        
        if (inProgressEl) inProgressEl.textContent = execStats.inProgressCount;
        if (completedTodayEl) completedTodayEl.textContent = execStats.completedTodayCount;
        if (avgProgressEl) avgProgressEl.textContent = `${execStats.avgProgress}%`;
        
        App.updateStatusStats();
        
        ['lineA', 'lineB', 'lineC'].forEach((lineId, index) => {
            const load = Store.getLineLoad(lineId);
            const loadEl = document.getElementById(`loadLine${['A', 'B', 'C'][index]}`);
            const fillEl = document.getElementById(`loadFill${['A', 'B', 'C'][index]}`);
            
            if (loadEl) loadEl.textContent = `${load.toFixed(0)}%`;
            if (fillEl) {
                fillEl.style.width = `${load}%`;
                
                fillEl.classList.remove('load-warning', 'load-danger');
                if (load >= 90) {
                    fillEl.classList.add('load-danger');
                } else if (load >= 70) {
                    fillEl.classList.add('load-warning');
                }
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
        const { startMinute, dayOffset } = positionToAbsolute(percent, trackRect.width, e.clientX, trackRect.left);
        
        let clampedStart = Utils.roundToNearest(startMinute, SNAP_MINUTES);
        clampedStart = Math.max(clampedStart, WORK_START_MINUTE);
        
        if (!Store.isInAnyShift(clampedStart) || Store.isInBreakTime(clampedStart)) {
            const nextAvail = Store.findNextAvailableMinute(
                Store.getWorkDayOffset(new Date(), dayOffset), 
                clampedStart, 
                1
            );
            if (nextAvail) {
                clampedStart = nextAvail.minute;
            } else {
                Utils.showToast('该时段不可安排生产（非工作时段）', 'error');
                return;
            }
        }
        
        if (Store.hasConflict(orderId, lineId, clampedStart, order.stdMinutes, dayOffset)) {
            Utils.showToast('时间冲突，无法放置', 'error');
            return;
        }
        
        const segments = Store.splitOrderForMultiDay(order, lineId, clampedStart, dayOffset);
        
        Store.updateWorkOrder(orderId, {
            lineId: lineId,
            startMinute: segments[0].startMinute,
            dayOffset: segments[0].dayOffset,
            segments: segments.length > 1 ? segments : null
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

    function handleBarMouseDown(e, bar, order, segment) {
        if (e.target.classList.contains('bar-action-btn')) return;
        
        e.preventDefault();
        const track = bar.parentElement;
        const trackRect = track.getBoundingClientRect();
        
        dragState = {
            isDragging: true,
            orderId: order.id,
            startX: e.clientX,
            startY: e.clientY,
            originalLine: order.lineId,
            originalStart: order.startMinute,
            originalDay: order.dayOffset || 0,
            originalSegments: order.segments ? Utils.deepClone(order.segments) : null,
            currentLine: order.lineId,
            currentStart: segment.startMinute,
            currentDay: segment.dayOffset,
            element: bar,
            trackWidth: trackRect.width,
            trackRect: trackRect
        };
        
        bar.classList.add('dragging');
        
        const minutesPerPixel = getTotalDisplayMinutes() / trackRect.width;
        dragState.minutesPerPixel = minutesPerPixel;
    }

    function handleMouseMove(e) {
        if (!dragState.isDragging) return;
        
        const bar = dragState.element;
        const order = Store.getWorkOrderById(dragState.orderId);
        if (!bar || !order) return;
        
        const deltaX = e.clientX - dragState.startX;
        const deltaMinutes = deltaX * dragState.minutesPerPixel;
        
        const originalAbsolute = dragState.originalDay * WORK_MINUTES_PER_DAY + (dragState.originalStart - WORK_START_MINUTE);
        let newAbsolute = originalAbsolute + deltaMinutes;
        newAbsolute = Utils.roundToNearest(newAbsolute, SNAP_MINUTES);
        newAbsolute = Utils.clamp(newAbsolute, 0, getTotalDisplayMinutes() - Math.min(order.stdMinutes, WORK_MINUTES_PER_DAY));
        
        const newDisplayIndex = Math.floor(newAbsolute / WORK_MINUTES_PER_DAY);
        let newStart = WORK_START_MINUTE + (newAbsolute % WORK_MINUTES_PER_DAY);
        
        if (Store.isInBreakTime(newStart) || !Store.isInAnyShift(newStart)) {
            const workDays = getWorkDaysToDisplay();
            const workDate = workDays[Math.min(newDisplayIndex, workDays.length - 1)];
            const nextAvail = Store.findNextAvailableMinute(workDate, newStart, 1);
            if (nextAvail) {
                newStart = nextAvail.minute;
            }
        }
        
        const workDays = getWorkDaysToDisplay();
        const actualDate = workDays[Math.min(newDisplayIndex, workDays.length - 1)];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const newDay = Math.floor((actualDate - today) / (1000 * 60 * 60 * 24));
        
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
        dragState.currentDay = newDay;
        
        const leftPercent = (newAbsolute / getTotalDisplayMinutes()) * 100;
        bar.style.left = `${leftPercent}%`;
        
        const hasConflict = Store.hasConflict(dragState.orderId, newLine, newStart, order.stdMinutes, newDay);
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
            
            const hasConflict = Store.hasConflict(
                dragState.orderId, 
                dragState.currentLine, 
                dragState.currentStart, 
                order.stdMinutes,
                dragState.currentDay
            );
            
            if (!hasConflict) {
                const segments = Store.splitOrderForMultiDay(
                    order, 
                    dragState.currentLine, 
                    dragState.currentStart, 
                    dragState.currentDay
                );
                
                Store.updateWorkOrder(dragState.orderId, {
                    lineId: dragState.currentLine,
                    startMinute: segments[0].startMinute,
                    dayOffset: segments[0].dayOffset,
                    segments: segments.length > 1 ? segments : null
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
        getWorkEndTime,
        getTimeScale,
        setTimeScale,
        getDisplayDays,
        getTotalDisplayMinutes,
        updateCalendarSettings,
        renderTimeRuler,
        setShowHistorical
    };
})();

const Scheduler = (function() {
    const MAX_DAYS = 14;
    const SNAP_MINUTES = 15;

    function autoSchedule(algorithm = 'edd') {
        const unscheduled = Store.getUnscheduledOrders();
        
        if (unscheduled.length === 0) {
            Utils.showToast('没有待排程的工单', 'warning');
            return 0;
        }
        
        const sortedOrders = sortOrders(unscheduled, algorithm);
        let scheduledCount = 0;
        
        sortedOrders.forEach(order => {
            const result = findBestSlot(order);
            if (result) {
                const segments = Store.splitOrderForMultiDay(
                    order, 
                    result.lineId, 
                    result.startMinute, 
                    result.dayOffset
                );
                
                Store.updateWorkOrder(order.id, {
                    lineId: result.lineId,
                    startMinute: segments[0].startMinute,
                    dayOffset: segments[0].dayOffset,
                    segments: segments.length > 1 ? segments : null
                });
                scheduledCount++;
            }
        });
        
        if (scheduledCount > 0) {
            Store.addAuditLog(Store.AUDIT_ACTION_TYPES.AUTO_SCHEDULE, {
                algorithm: algorithm,
                scheduledCount: scheduledCount,
                totalOrders: unscheduled.length
            });
        }
        
        if (scheduledCount === 0) {
            Utils.showToast('没有足够的时间排程所有工单', 'warning');
        }
        
        return scheduledCount;
    }

    function sortOrders(orders, algorithm) {
        const sorted = [...orders];
        
        switch (algorithm) {
            case 'edd':
                sorted.sort((a, b) => {
                    const dateA = new Date(a.dueDate);
                    const dateB = new Date(b.dueDate);
                    return dateA - dateB;
                });
                break;
                
            case 'spt':
                sorted.sort((a, b) => a.stdMinutes - b.stdMinutes);
                break;
                
            default:
                break;
        }
        
        return sorted;
    }

    function findBestSlot(order) {
        const lines = Store.getLines();
        let bestSlot = null;
        let earliestEnd = Infinity;
        
        lines.forEach(line => {
            const slot = findEarliestSlot(order, line.id);
            if (slot !== null) {
                const segments = Store.splitOrderForMultiDay(order, line.id, slot.startMinute, slot.dayOffset);
                const lastSegment = segments[segments.length - 1];
                const endDate = Store.getWorkDayOffset(new Date(), lastSegment.dayOffset);
                const endAbsolute = (lastSegment.dayOffset * 24 * 60) + lastSegment.endMinute;
                
                if (endAbsolute < earliestEnd) {
                    earliestEnd = endAbsolute;
                    bestSlot = {
                        lineId: line.id,
                        startMinute: slot.startMinute,
                        dayOffset: slot.dayOffset
                    };
                }
            }
        });
        
        return bestSlot;
    }

    function findEarliestSlot(order, lineId) {
        const line = Store.getLineById(lineId);
        if (!line) return null;
        
        const lineOrders = Store.getOrdersByLine(lineId, true).filter(o => o.id !== order.id);
        
        if (lineOrders.length === 0) {
            const firstAvailable = findFirstAvailableSlot(lineId, 0, Store.getWorkStartTime());
            return firstAvailable;
        }
        
        const occupiedSlots = buildOccupiedSlots(lineOrders);
        occupiedSlots.sort((a, b) => a.start - b.start);
        
        const workStart = Store.getWorkStartTime();
        const workEnd = Store.getWorkEndTime();
        const availablePerDay = Store.getAvailableMinutesPerDay();
        const checkDuration = Math.min(order.stdMinutes, availablePerDay);
        
        for (let dayOffset = 0; dayOffset < MAX_DAYS; dayOffset++) {
            const date = Store.getWorkDayOffset(new Date(), dayOffset);
            if (!Store.isWorkDay(date) || Store.isDowntime(date)) continue;
            
            const dayStartAbsolute = dayOffset * 24 * 60 + workStart;
            const dayEndAbsolute = dayOffset * 24 * 60 + workEnd;
            
            let candidateStart = dayStartAbsolute;
            
            const daySlots = occupiedSlots.filter(s => 
                s.end > dayStartAbsolute && s.start < dayEndAbsolute
            );
            
            for (const slot of daySlots) {
                if (candidateStart + checkDuration <= slot.start) {
                    const candidateMinute = candidateStart % (24 * 60);
                    const candidateDate = Store.getWorkDayOffset(new Date(), Math.floor(candidateStart / (24 * 60)));
                    
                    if (Store.isAvailableProductionTime(candidateDate, candidateMinute)) {
                        const snapped = Utils.roundToNearest(candidateMinute, SNAP_MINUTES);
                        const snappedDay = Math.floor(candidateStart / (24 * 60));
                        return { startMinute: snapped, dayOffset: snappedDay };
                    } else {
                        const nextAvail = Store.findNextAvailableMinute(candidateDate, candidateMinute, 1);
                        if (nextAvail) {
                            return { startMinute: nextAvail.minute, dayOffset: nextAvail.dayOffset };
                        }
                    }
                }
                candidateStart = Math.max(candidateStart, slot.end);
            }
            
            if (candidateStart + checkDuration <= dayEndAbsolute) {
                const candidateMinute = candidateStart % (24 * 60);
                const candidateDate = Store.getWorkDayOffset(new Date(), Math.floor(candidateStart / (24 * 60)));
                
                if (Store.isAvailableProductionTime(candidateDate, candidateMinute)) {
                    const snapped = Utils.roundToNearest(candidateMinute, SNAP_MINUTES);
                    const snappedDay = Math.floor(candidateStart / (24 * 60));
                    return { startMinute: snapped, dayOffset: snappedDay };
                } else {
                    const nextAvail = Store.findNextAvailableMinute(candidateDate, candidateMinute, 1);
                    if (nextAvail && nextAvail.dayOffset < MAX_DAYS) {
                        return { startMinute: nextAvail.minute, dayOffset: nextAvail.dayOffset };
                    }
                }
            }
        }
        
        return null;
    }

    function buildOccupiedSlots(lineOrders) {
        const slots = [];
        lineOrders.forEach(existing => {
            const segments = existing.segments || [{
                dayOffset: existing.dayOffset || 0,
                startMinute: existing.startMinute,
                duration: existing.stdMinutes,
                endMinute: existing.startMinute + existing.stdMinutes
            }];
            
            segments.forEach(seg => {
                const startAbsolute = seg.dayOffset * 24 * 60 + seg.startMinute;
                const endAbsolute = startAbsolute + seg.duration;
                slots.push({ start: startAbsolute, end: endAbsolute });
            });
        });
        return slots;
    }

    function findFirstAvailableSlot(lineId, fromDayOffset, fromMinute) {
        const workStart = Store.getWorkStartTime();
        let dayOffset = fromDayOffset;
        let minute = fromMinute;
        
        while (dayOffset < MAX_DAYS) {
            const date = Store.getWorkDayOffset(new Date(), dayOffset);
            const result = Store.findNextAvailableMinute(date, minute, 1);
            if (result) {
                return { startMinute: result.minute, dayOffset: result.dayOffset };
            }
            dayOffset++;
            minute = workStart;
        }
        return { startMinute: workStart, dayOffset: 0 };
    }

    function findNextAvailableSlot(lineId, duration, excludeOrderId = null) {
        let lineOrders = Store.getOrdersByLine(lineId, true);
        if (excludeOrderId) {
            lineOrders = lineOrders.filter(o => o.id !== excludeOrderId);
        }
        
        if (lineOrders.length === 0) {
            return findFirstAvailableSlot(lineId, 0, Store.getWorkStartTime());
        }
        
        const occupiedSlots = buildOccupiedSlots(lineOrders);
        occupiedSlots.sort((a, b) => a.start - b.start);
        
        const workStart = Store.getWorkStartTime();
        const workEnd = Store.getWorkEndTime();
        const availablePerDay = Store.getAvailableMinutesPerDay();
        const checkDuration = Math.min(duration, availablePerDay);
        
        for (let dayOffset = 0; dayOffset < MAX_DAYS; dayOffset++) {
            const date = Store.getWorkDayOffset(new Date(), dayOffset);
            if (!Store.isWorkDay(date) || Store.isDowntime(date)) continue;
            
            const dayStartAbsolute = dayOffset * 24 * 60 + workStart;
            const dayEndAbsolute = dayOffset * 24 * 60 + workEnd;
            
            let candidateStart = dayStartAbsolute;
            
            const daySlots = occupiedSlots.filter(s => 
                s.end > dayStartAbsolute && s.start < dayEndAbsolute
            );
            
            for (const slot of daySlots) {
                if (candidateStart + checkDuration <= slot.start) {
                    const candidateMinute = candidateStart % (24 * 60);
                    const candidateDate = Store.getWorkDayOffset(new Date(), Math.floor(candidateStart / (24 * 60)));
                    
                    if (Store.isAvailableProductionTime(candidateDate, candidateMinute)) {
                        const snapped = Utils.roundToNearest(candidateMinute, SNAP_MINUTES);
                        const snappedDay = Math.floor(candidateStart / (24 * 60));
                        return { startMinute: snapped, dayOffset: snappedDay };
                    } else {
                        const nextAvail = Store.findNextAvailableMinute(candidateDate, candidateMinute, 1);
                        if (nextAvail) {
                            return { startMinute: nextAvail.minute, dayOffset: nextAvail.dayOffset };
                        }
                    }
                }
                candidateStart = Math.max(candidateStart, slot.end);
            }
            
            if (candidateStart + checkDuration <= dayEndAbsolute) {
                const candidateMinute = candidateStart % (24 * 60);
                const candidateDate = Store.getWorkDayOffset(new Date(), Math.floor(candidateStart / (24 * 60)));
                
                if (Store.isAvailableProductionTime(candidateDate, candidateMinute)) {
                    const snapped = Utils.roundToNearest(candidateMinute, SNAP_MINUTES);
                    const snappedDay = Math.floor(candidateStart / (24 * 60));
                    return { startMinute: snapped, dayOffset: snappedDay };
                } else {
                    const nextAvail = Store.findNextAvailableMinute(candidateDate, candidateMinute, 1);
                    if (nextAvail && nextAvail.dayOffset < MAX_DAYS) {
                        return { startMinute: nextAvail.minute, dayOffset: nextAvail.dayOffset };
                    }
                }
            }
        }
        
        return null;
    }

    function balanceLoad() {
        const lines = Store.getLines();
        const allScheduled = Store.getScheduledOrders();
        
        if (allScheduled.length === 0) return;
        
        const lineLoads = {};
        lines.forEach(line => {
            lineLoads[line.id] = Store.getLineLoad(line.id);
        });
        
        allScheduled.sort((a, b) => b.stdMinutes - a.stdMinutes);
        
        allScheduled.forEach(order => {
            let minLoadLine = null;
            let minLoad = Infinity;
            
            lines.forEach(line => {
                const slot = findEarliestSlot(order, line.id);
                if (slot !== null) {
                    const availablePerDay = Store.getAvailableMinutesPerDay();
                    const newLoad = lineLoads[line.id] + (order.stdMinutes / availablePerDay * 100);
                    if (newLoad < minLoad) {
                        minLoad = newLoad;
                        minLoadLine = line.id;
                    }
                }
            });
            
            if (minLoadLine && minLoadLine !== order.lineId) {
                const slot = findEarliestSlot(order, minLoadLine);
                if (slot !== null) {
                    const oldLine = order.lineId;
                    const segments = Store.splitOrderForMultiDay(order, minLoadLine, slot.startMinute, slot.dayOffset);
                    
                    Store.updateWorkOrder(order.id, {
                        lineId: minLoadLine,
                        startMinute: segments[0].startMinute,
                        dayOffset: segments[0].dayOffset,
                        segments: segments.length > 1 ? segments : null
                    });
                    
                    const availablePerDay = Store.getAvailableMinutesPerDay();
                    lineLoads[oldLine] -= (order.stdMinutes / availablePerDay * 100);
                    lineLoads[minLoadLine] += (order.stdMinutes / availablePerDay * 100);
                }
            }
        });
    }

    function rescheduleAll(algorithm = 'edd') {
        const allOrders = Store.getWorkOrders();
        
        allOrders.forEach(order => {
            if (order.status !== Store.ORDER_STATUS.COMPLETED && 
                order.status !== Store.ORDER_STATUS.CANCELLED) {
                Store.updateWorkOrder(order.id, {
                    lineId: null,
                    startMinute: null,
                    dayOffset: null,
                    segments: null,
                    status: Store.ORDER_STATUS.PENDING
                });
            }
        });
        
        const count = autoSchedule(algorithm);
        
        return count;
    }

    function updateCalendarSettings() {
    }

    return {
        autoSchedule,
        rescheduleAll,
        balanceLoad,
        findNextAvailableSlot,
        findEarliestSlot,
        updateCalendarSettings
    };
})();

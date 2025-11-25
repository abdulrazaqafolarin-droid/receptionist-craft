import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, X, Calendar, User } from "lucide-react";

interface AppointmentFiltersProps {
  onFilterChange: (filters: FilterState) => void;
  totalCount: number;
  filteredCount: number;
}

export interface FilterState {
  search: string;
  status: string[];
  startDate: string;
  endDate: string;
  service: string;
}

export function AppointmentFilters({ onFilterChange, totalCount, filteredCount }: AppointmentFiltersProps) {
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    status: [],
    startDate: "",
    endDate: "",
    service: ""
  });
  const [showFilters, setShowFilters] = useState(false);

  const updateFilters = (updates: Partial<FilterState>) => {
    const newFilters = { ...filters, ...updates };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const clearFilters = () => {
    const emptyFilters = {
      search: "",
      status: [],
      startDate: "",
      endDate: "",
      service: ""
    };
    setFilters(emptyFilters);
    onFilterChange(emptyFilters);
  };

  const toggleStatus = (status: string) => {
    const newStatus = filters.status.includes(status)
      ? filters.status.filter(s => s !== status)
      : [...filters.status, status];
    updateFilters({ status: newStatus });
  };

  const hasActiveFilters = filters.search || filters.status.length > 0 || 
                          filters.startDate || filters.endDate || filters.service;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Search and Toggle */}
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, or service..."
                value={filters.search}
                onChange={(e) => updateFilters({ search: e.target.value })}
                className="pl-9"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="mr-2 h-4 w-4" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-2">
                  {[
                    filters.status.length,
                    filters.startDate ? 1 : 0,
                    filters.endDate ? 1 : 0,
                    filters.service ? 1 : 0
                  ].reduce((a, b) => a + b, 0)}
                </Badge>
              )}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" onClick={clearFilters}>
                <X className="mr-2 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>

          {/* Results Count */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            Showing {filteredCount} of {totalCount} appointments
            {hasActiveFilters && ` (filtered)`}
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="grid md:grid-cols-2 gap-4 pt-4 border-t">
              {/* Status Filter */}
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex flex-wrap gap-2">
                  {["booked", "cancelled", "completed"].map((status) => (
                    <Button
                      key={status}
                      variant={filters.status.includes(status) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleStatus(status)}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Service Filter */}
              <div className="space-y-2">
                <Label htmlFor="service">Service</Label>
                <Input
                  id="service"
                  placeholder="Filter by service name..."
                  value={filters.service}
                  onChange={(e) => updateFilters({ service: e.target.value })}
                />
              </div>

              {/* Date Range */}
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="startDate"
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => updateFilters({ startDate: e.target.value })}
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="endDate"
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => updateFilters({ endDate: e.target.value })}
                    className="pl-9"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
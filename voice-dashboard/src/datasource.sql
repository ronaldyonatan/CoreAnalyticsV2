alter procedure spDashboard(   
	@Mode varchar(100) = '', 
    @HealthcareID varchar(3) = '' 
)   
   
as   
   
set nocount on   
 
DECLARE @CurrentYear INT = YEAR(GETDATE()) 
DECLARE @LastYear INT = @CurrentYear - 1; 
DECLARE @PrevYear INT = @CurrentYear - 2; 
    DECLARE @SQL NVARCHAR(MAX); 
 
 
if @Mode = 'TrenPendapatan'   
begin   
    SELECT    
        MonthNo,   
        DATENAME(month, MAX(TransactionDate)) AS month_name,   
        SUM(CASE WHEN YearNo = 2026 THEN ActualAmount ELSE 0 END) AS revenue_2026,   
        SUM(CASE WHEN YearNo = 2025 THEN ActualAmount ELSE 0 END) AS revenue_2025   
    FROM DB_Finance_Actual   
    WHERE YearNo IN (2025, 2026)   
        and criteria = 'REVENUE'   
        and left(healthcareID,1) <> 'O'   
        and (HealthcareID = @healthcareId or @healthcareId = '') 
    GROUP BY MonthNo   
    ORDER BY MonthNo;   
end   
if @Mode = 'PerbandinganLayanan'   
begin   
    SELECT    
        Criteria AS category,   
        SUM(CASE WHEN Chanel = 'Clinic' THEN ActualAmount ELSE 0 END) AS clinic,   
        SUM(CASE WHEN Chanel = 'Hospital' THEN ActualAmount ELSE 0 END) AS rs   
    FROM DB_Finance_Actual   
    WHERE YearNo = 2026   
    and (HealthcareID = @healthcareId or @healthcareId = '') 
    GROUP BY Criteria;   
end   
if @Mode = 'performalayanan'   
begin   
    SELECT    
        ChartOfAccountName AS category,   
        SUM(CASE WHEN HealthcareID = '001' THEN ActualAmount ELSE 0 END) AS menteng,   
        SUM(CASE WHEN HealthcareID = '002' THEN ActualAmount ELSE 0 END) AS kedoya   
    FROM DB_Finance_Actual   
    WHERE healthcareID in('001','002') AND YearNo = 2026   
    and (HealthcareID = @healthcareId or @healthcareId = '') 
    GROUP BY ChartOfAccountName;   
end   
if @Mode = 'PertumbuhanPasien'   
begin   
    SELECT    
        CAST(YearNo AS VARCHAR) AS year,    
        SUM(ActualQuantity) AS totalPasien   
    FROM DB_Finance_Actual   
    WHERE YearNo BETWEEN 2022 AND 2026   
    and (HealthcareID = @healthcareId or @healthcareId = '') 
    GROUP BY YearNo   
    ORDER BY YearNo ASC;   
end  
  
if @Mode = 'healthcare'   
begin   
    SELECT    
        healthcareID, healthcareName  
    FROM JEC_CORP.dbo.healthcare   
    order by HealthcareName  
end 
 
if @Mode = 'exumrev' 
begin 
 
    SET @SQL = ' 
    SELECT healthcareID, 
        HealthcareName AS [UNIT BISNIS], 
        SUM(CASE WHEN YearNo = ' + CAST(@CurrentYear AS VARCHAR) + ' THEN Actual ELSE 0 END) AS [Current Year], 
        SUM(CASE WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + ' THEN Actual ELSE 0 END) AS [Full Year ' + CAST(@LastYear AS VARCHAR) + '], 
        SUM(CASE WHEN YearNo = ' + CAST(@PrevYear AS VARCHAR) + ' THEN Actual ELSE 0 END) AS [Full Year ' + CAST(@PrevYear AS VARCHAR) + '], 
        CASE  
            WHEN SUM(CASE WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + ' THEN Actual ELSE 0 END) = 0 THEN 0 
            ELSE (SUM(CASE WHEN YearNo = ' + CAST(@CurrentYear AS VARCHAR) + ' THEN Actual ELSE 0 END) * 100.0) /  
                SUM(CASE WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + ' THEN Actual ELSE 0 END)  
        END AS [' + CAST(@CurrentYear AS VARCHAR) + ' vs ' + CAST(@LastYear AS VARCHAR) + '] 
    FROM DB_Finance_Exsum 
    WHERE Category = ''REV'' 
        and criteria = ''Revenue'' 
        and left(HealthcareID,1) <> ''O'' 
        and (healthcareID = ''' + @HealthcareID + ''' or isnull(''' + @HealthcareID + ''','''') = '''') 
        and HealthcareName is not null 
 
    GROUP BY HealthcareName, healthcareID 
    ORDER BY healthcareID ASC;'; 
 
    -- Menjalankan query dinamis 
    EXEC sp_executesql @SQL; 
end 
 
if @Mode = 'exummaterial' 
begin 
 
    SET @SQL = ' 
    SELECT healthcareID, 
        HealthcareName AS [UNIT BISNIS], 
        SUM(CASE WHEN YearNo = ' + CAST(@CurrentYear AS VARCHAR) + ' THEN Actual ELSE 0 END) AS [Current Year], 
        SUM(CASE WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + ' THEN Actual ELSE 0 END) AS [Full Year ' + CAST(@LastYear AS VARCHAR) + '], 
        SUM(CASE WHEN YearNo = ' + CAST(@PrevYear AS VARCHAR) + ' THEN Actual ELSE 0 END) AS [Full Year ' + CAST(@PrevYear AS VARCHAR) + '], 
        CASE  
            WHEN SUM(CASE WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + ' THEN Actual ELSE 0 END) = 0 THEN 0 
            ELSE (SUM(CASE WHEN YearNo = ' + CAST(@CurrentYear AS VARCHAR) + ' THEN Actual ELSE 0 END) * 100.0) /  
                SUM(CASE WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + ' THEN Actual ELSE 0 END)  
        END AS [' + CAST(@CurrentYear AS VARCHAR) + ' vs ' + CAST(@LastYear AS VARCHAR) + '] 
    FROM DB_Finance_Exsum 
    WHERE Category = ''REV'' 
        and criteria = ''Revenue'' 
        and left(HealthcareID,1) <> ''O'' 
        and (healthcareID = ''' + @HealthcareID + ''' or isnull(''' + @HealthcareID + ''','''') = '''') 
        and HealthcareName is not null 
 
    GROUP BY HealthcareName, healthcareID 
    ORDER BY healthcareID ASC;'; 
 
    -- Menjalankan query dinamis 
    EXEC sp_executesql @SQL; 
end 
 
 
if @Mode = 'exumdoctor' 
begin 
 
    SET @SQL = ' 
    SELECT healthcareID, 
        HealthcareName AS [UNIT BISNIS], 
        SUM(CASE WHEN YearNo = ' + CAST(@CurrentYear AS VARCHAR) + ' THEN Actual ELSE 0 END) AS [Current Year], 
        SUM(CASE WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + ' THEN Actual ELSE 0 END) AS [Full Year ' + CAST(@LastYear AS VARCHAR) + '], 
        SUM(CASE WHEN YearNo = ' + CAST(@PrevYear AS VARCHAR) + ' THEN Actual ELSE 0 END) AS [Full Year ' + CAST(@PrevYear AS VARCHAR) + '], 
        CASE  
            WHEN SUM(CASE WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + ' THEN Actual ELSE 0 END) = 0 THEN 0 
            ELSE (SUM(CASE WHEN YearNo = ' + CAST(@CurrentYear AS VARCHAR) + ' THEN Actual ELSE 0 END) * 100.0) /  
                SUM(CASE WHEN YearNo = ' + CAST(@LastYear AS VARCHAR) + ' THEN Actual ELSE 0 END)  
        END AS [' + CAST(@CurrentYear AS VARCHAR) + ' vs ' + CAST(@LastYear AS VARCHAR) + '] 
    FROM DB_Finance_Exsum 
    WHERE Category = ''REV'' 
        and criteria = ''Doctor Fee'' 
        and left(HealthcareID,1) <> ''O'' 
        and (healthcareID = ''' + @HealthcareID + ''' or isnull(''' + @HealthcareID + ''','''') = '''') 
        and HealthcareName is not null 
 
    GROUP BY HealthcareName, healthcareID 
    ORDER BY healthcareID ASC;'; 
 
    -- Menjalankan query dinamis 
    EXEC sp_executesql @SQL; 
end

if @Mode = 'revsentra'
BEGIN
    -- 1. Data Tahun Ini
    select case when isnull(center,'') = '' then 'OTHERS' 
        when center = 'OTHER' then 'OTHERS' 
        else center end as Center, sum(ActualAmount) as Amount
    into #currentYear
    from DB_Finance_Actual
    where yearno = year(getdate())
    and criteria = 'Revenue'
    and (HealthcareID = @HealthcareID or isnull(@HealthcareID,'') = '')
    group by case when isnull(center,'') = '' then 'OTHERS' 
        when center = 'OTHER' then 'OTHERS' 
        else center end

    -- 2. Data Tahun Lalu
    select case when isnull(center,'') = '' then 'OTHERS' 
        when center = 'OTHER' then 'OTHERS' 
        else center end as Center, sum(ActualAmount) as Amount
    into #lastyear
    from DB_Finance_Actual
    where yearno = year(getdate()) - 1
    and criteria = 'Revenue'
    and (HealthcareID = @HealthcareID or isnull(@HealthcareID,'') = '')
    group by case when isnull(center,'') = '' then 'OTHERS' 
        when center = 'OTHER' then 'OTHERS' 
        else center end

    --------------------------------------------------------------------------------
    -- 3. Query Perbandingan
    --------------------------------------------------------------------------------
    select 
        ISNULL(c.Center, l.Center) as Center,
        ISNULL(c.Amount, 0) as CurrentYear_Amount,
        ISNULL(l.Amount, 0) as LastYear_Amount,
        ISNULL(c.Amount, 0) - ISNULL(l.Amount, 0) as Variance_Amount,
        CASE 
            WHEN ISNULL(l.Amount, 0) = 0 THEN NULL
            ELSE CAST(
                ((CAST(ISNULL(c.Amount, 0) AS float) - CAST(l.Amount AS float)) / CAST(l.Amount AS float)) * 100 
                AS DECIMAL(10,2))
        END as Growth_Percentage
    from #currentYear c
    FULL OUTER JOIN #lastyear l on c.Center = l.Center
    order by Center;

    -- 4. Hapus Temporary Tables
    drop table #currentYear;
    drop table #lastyear;
end

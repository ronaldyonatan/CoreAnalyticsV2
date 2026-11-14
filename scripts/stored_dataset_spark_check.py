"""Offline Spark driver sanity test. Never connects to a source database."""
import os
import sys
from pyspark.sql import SparkSession


def main():
    jars = [os.environ['STUDIO_SQLSERVER_JDBC_JAR'], os.environ['STUDIO_POSTGRESQL_JDBC_JAR']]
    spark = None
    try:
        spark = (SparkSession.builder.appName('CoreAnalytics DualDB JDBC Preflight')
                 .master(os.environ['STUDIO_SPARK_MASTER'])
                 .config('spark.ui.enabled', 'false')
                 .config('spark.jars', ','.join(jars)).getOrCreate())
        loader = spark._jvm.org.apache.spark.util.Utils.getContextOrSparkClassLoader()
        for classname in ('com.microsoft.sqlserver.jdbc.SQLServerDriver', 'org.postgresql.Driver'):
            loader.loadClass(classname)
            print('Spark JDBC class available:', classname)
        print('Spark local execution:', spark.range(3).count(), 'rows')
        return 0
    except Exception:
        # JVM exceptions can include classpaths or other configuration details.
        print('Spark JDBC check failed; review private Spark logs locally.', file=sys.stderr)
        return 1
    finally:
        if spark:
            spark.stop()


if __name__ == '__main__':
    raise SystemExit(main())

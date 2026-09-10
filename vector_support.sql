-- Vector operations for semantic search and embeddings in PostgreSQL 16
CREATE OR REPLACE FUNCTION vector_dot_product(a float8[], b float8[])
RETURNS float8 AS $$
DECLARE
    sum float8 := 0;
    i int;
    len int := cardinality(a);
BEGIN
    IF len != cardinality(b) THEN
        RETURN 0.0;
    END IF;
    FOR i IN 1..len LOOP
        sum := sum + (a[i] * b[i]);
    END LOOP;
    RETURN sum;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;

CREATE OR REPLACE FUNCTION vector_norm(a float8[])
RETURNS float8 AS $$
DECLARE
    sum float8 := 0;
    i int;
    len int := cardinality(a);
BEGIN
    FOR i IN 1..len LOOP
        sum := sum + (a[i] * a[i]);
    END LOOP;
    RETURN sqrt(sum);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;

CREATE OR REPLACE FUNCTION vector_cosine_similarity(a float8[], b float8[])
RETURNS float8 AS $$
DECLARE
    dot float8;
    na float8;
    nb float8;
BEGIN
    na := vector_norm(a);
    nb := vector_norm(b);
    IF na = 0.0 OR nb = 0.0 THEN
        RETURN 0.0;
    END IF;
    dot := vector_dot_product(a, b);
    RETURN dot / (na * nb);
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE;
